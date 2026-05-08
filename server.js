require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const db = require('./database');
const crypto = require('crypto');
const aiService = require('./ai-service');
const WebSocket = require('ws');
const QRCode = require('qrcode');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers with helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

// Restricted CORS - only allow your domain
const allowedOrigins = [
    'http://localhost:3002',
    'http://localhost:3000',
    process.env.ALLOWED_ORIGIN, // Set this in production
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked origin: ${origin}`);
            callback(null, false); // Don't throw error, just reject
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting for login endpoint - prevent brute force
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per IP per window
    skipSuccessfulRequests: true, // Reset on successful login
    message: { error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// General API rate limiter
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
});

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
    console.warn('⚠️  JWT_SECRET not set. Using a random secret. Set JWT_SECRET env var for persistence across restarts!');
}
const JWT_EXPIRY = '24h';

// JWT Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { userId, role, iat, exp }
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
}

// Admin authorization middleware
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// Apply API rate limiting to all /api routes
app.use('/api', apiLimiter);

app.use(bodyParser.json({ limit: '50mb' }));

// Serve static files from desktop/dist and public
app.use('/desktop/assets', express.static(path.join(__dirname, 'desktop', 'dist', 'assets')));
app.use('/desktop', express.static(path.join(__dirname, 'desktop', 'dist')));
// Public static files (mobile mic relay)
app.use('/public', express.static(path.join(__dirname, 'public')));

// Protected uploads - require authentication
app.use('/uploads', authenticateToken, express.static(path.join(__dirname, 'uploads')));

// Redirect root to /desktop
app.get('/', (req, res) => {
    res.redirect('/desktop');
});

// SPA fallback for /desktop routes (must be after static assets)
app.get('/desktop/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'desktop', 'dist', 'index.html'));
});

const upload = multer({ storage: multer.memoryStorage() });

// Simple AES-256-GCM helpers for securing transcripts at rest
function getKeyBuffer() {
    const raw = process.env.ENC_KEY || process.env.ENCRYPTION_KEY || '';
    if (!raw) {
        return Buffer.from('dev_default_key_dev_default_key__32', 'utf8').slice(0, 32);
    }
    try {
        if (/^[A-Za-z0-9+/=]+$/.test(raw)) {
            const buf = Buffer.from(raw, 'base64');
            if (buf.length === 32) return buf;
        }
    } catch {}
    try {
        if (/^[0-9a-fA-F]+$/.test(raw)) {
            const buf = Buffer.from(raw, 'hex');
            if (buf.length === 32) return buf;
        }
    } catch {}
    return Buffer.from(raw.padEnd(32, '0'), 'utf8').slice(0, 32);
}
const ENC_KEY_BUF = getKeyBuffer();
function encryptField(text) {
    if (!text) return '';
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY_BUF, iv);
    let enc = cipher.update(String(text), 'utf8', 'base64');
    enc += cipher.final('base64');
    const tag = cipher.getAuthTag().toString('base64');
    return `${iv.toString('base64')}:${tag}:${enc}`;
}
function decryptField(payload) {
    if (!payload) return '';
    try {
        const [ivB64, tagB64, dataB64] = String(payload).split(':');
        const iv = Buffer.from(ivB64, 'base64');
        const tag = Buffer.from(tagB64, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY_BUF, iv);
        decipher.setAuthTag(tag);
        let dec = decipher.update(dataB64, 'base64', 'utf8');
        dec += decipher.final('utf8');
        return dec;
    } catch {
        return String(payload);
    }
}

// Save a raw transcript with an editable patient name
app.post('/api/save-transcript', authenticateToken, async (req, res) => {
    try {
        const { userId, domain, patientName, transcription } = req.body;
        if (!userId || !domain || !patientName || !transcription) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const patientId = await db.ensurePatientByName({ name: patientName, domain, user_id: userId });
        const session = await db.createSession({ user_id: userId, patient_id: patientId, domain });
        await db.updateSession(session.id, { transcription: encryptField(transcription), status: 'transcript_only' });
        res.status(201).json({ sessionId: session.id, patientId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Secure save transcript with patient name and dentist name, with salting/hashing
app.post('/api/save-transcript-secure', authenticateToken, async (req, res) => {
    try {
        const { userId, domain, patientName, dentistName, transcription, aiSummary } = req.body;
        if (!userId || !domain || !patientName || !dentistName || !transcription) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Generate unique salt for this record
        const salt = crypto.randomBytes(16).toString('hex');
        
        // Create hash of the combined data for integrity verification
        const dataToHash = `${patientName}:${dentistName}:${transcription}:${Date.now()}`;
        const hash = crypto.createHmac('sha256', salt + process.env.ENC_KEY || 'default_key')
            .update(dataToHash)
            .digest('hex');
        
        // Encrypt the data
        const encryptedTranscription = encryptField(transcription);
        const encryptedAiSummary = aiSummary ? encryptField(JSON.stringify(aiSummary)) : null;
        
        // Store with patient and dentist info
        const patientId = await db.ensurePatientByName({ name: patientName, domain, user_id: userId });
        const session = await db.createSession({ user_id: userId, patient_id: patientId, domain });
        
        // Update with encrypted data and metadata
        await db.updateSession(session.id, { 
            transcription: encryptedTranscription, 
            ai_notes: encryptedAiSummary,
            status: 'finalized',
            tooth_number: req.body.toothNumber || null,
            metadata: JSON.stringify({ 
                salt, 
                hash, 
                dentistName, 
                patientName,
                savedAt: new Date().toISOString()
            })
        });
        
        res.status(201).json({ 
            sessionId: session.id, 
            patientId,
            message: 'Transcript saved securely with encryption' 
        });
    } catch (error) {
        console.error('Secure save error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Upload voice note (audio/webm) and return a URL
app.post('/api/upload-voice', authenticateToken, upload.single('voice'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file' });
        const fs = require('fs');
        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
        const fname = `voice_${Date.now()}.webm`;
        const fpath = path.join(uploadsDir, fname);
        await fs.promises.writeFile(fpath, req.file.buffer);
        const url = `/uploads/${fname}`;
        res.status(201).json({ url });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// Create a new session and store the note + transcription (and optional audio)
app.post('/api/sessions', authenticateToken, async (req, res) => {
    try {
        const { userId, patientId, domain, transcription, aiNote } = req.body;
        if (!userId || !patientId || !domain) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const session = await db.createSession({ user_id: userId, patient_id: patientId, domain });
        const audioUrl = aiNote && (aiNote.audio_url || aiNote.audio_file) ? (aiNote.audio_url || aiNote.audio_file) : null;
        const payload = {
            transcription: encryptField(transcription || ''),
            ai_notes: JSON.stringify(aiNote || {}),
            status: 'finalized',
            audio_url: audioUrl || undefined
        };
        await db.updateSession(session.id, payload);
        res.status(201).json({ id: session.id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

// -------------------- Auth Routes --------------------
app.post('/api/register', async (req, res) => {
    try {
        const { userId, password, domain = 'dental', name = null, email = null } = req.body;
        if (!userId || !password) {
            return res.status(400).json({ error: 'Missing fields' });
        }
        await db.createUser({ user_id: userId, password, domain, name, email });
        res.status(201).json({ message: 'User registered' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'User already exists' });
        }
        console.error('Registration failed:', err);
        res.status(500).json({ error: `Registration failed: ${err.message || 'Unknown error'}` });
    }
});

app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        const { userId, password } = req.body;
        if (!userId || !password) {
            return res.status(400).json({ error: 'Missing userId or password' });
        }
        const user = await db.verifyUser({ user_id: userId, password });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        // Update last login
        try { await db.promisePool.query('UPDATE users SET last_login = NOW() WHERE user_id = ?', [userId]); } catch {}

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.user_id, role: user.role || 'clinician', domain: user.domain },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                userId: user.user_id,
                name: user.name,
                email: user.email,
                domain: user.domain,
                role: user.role || 'clinician'
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Verify token validity (for frontend session check)
app.get('/api/verify-token', authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// Change password (authenticated users)
app.post('/api/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Missing current or new password' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }

        // Verify current password
        const user = await db.verifyUser({ user_id: req.user.userId, password: currentPassword });
        if (!user) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Update password
        await db.updateUserProfile(req.user.userId, { password: newPassword });
        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ error: 'Failed to change password' });
    }
});
// -----------------------------------------------------

// API Endpoints
app.get('/health', (req, res) => res.json({ status: 'healthy', timestamp: Date.now() }));

app.post('/api/test-gemini', authenticateToken, async (req, res) => {
    try {
        console.log('🧪 /api/test-gemini AI_PROVIDER=', process.env.AI_PROVIDER, 'OPENAI_MODEL=', process.env.OPENAI_MODEL);
        const testTranscription = 'Patient presents with fever and cough for 3 days. Temperature is 101.5F. Chest X-ray shows mild pneumonia. Prescribed amoxicillin.';
        const note = await aiService.generateMedicalNote(testTranscription, 'medical');
        console.log('🧪 /api/test-gemini result keys:', Object.keys(note));
        res.json({ success: true, note });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Dental test endpoint
app.post('/api/test-gemini-dental', authenticateToken, async (req, res) => {
    try {
        console.log('🧪 /api/test-gemini-dental AI_PROVIDER=', process.env.AI_PROVIDER, 'OPENAI_MODEL=', process.env.OPENAI_MODEL);
        const testTranscription = 'Patient John reports sensitivity in the lower right molar and bleeding gums during brushing. Last dental visit was a while ago. Patient is nervous about this appointment.';
        const note = await aiService.generateMedicalNote(testTranscription, 'dental');
        console.log('🧪 /api/test-gemini-dental result keys:', Object.keys(note));
        res.json({ success: true, note });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/transcribe', authenticateToken, upload.single('audio'), async (req, res) => {
    try {
        const transcription = await aiService.transcribeAudio(req.file.buffer);
        res.json(transcription);
    } catch (error) {
        res.status(500).json({ error: 'Transcription failed' });
    }
});

app.post('/api/generate-note', authenticateToken, async (req, res) => {
    try {
        const { transcription, patientId, domain, userId, template } = req.body;

        if (!transcription || transcription.trim().length === 0) {
            return res.status(400).json({ error: 'Transcription is empty' });
        }

        console.log(`\n📝 Generating note for domain: ${domain}, template: ${template || 'none'}`);
        console.log('🔧 AI_PROVIDER=', process.env.AI_PROVIDER, 'OPENAI_MODEL=', process.env.OPENAI_MODEL);
        console.log(`📄 Transcription length: ${transcription.length} chars`);

        const aiNote = await aiService.generateMedicalNote(transcription, domain, template);
        
        console.log(`✅ Note generated successfully`);
        console.log(`📊 Note keys:`, Object.keys(aiNote));

        if (patientId && userId) {
            const session = await db.createSession({ user_id: userId, patient_id: patientId, domain });
            aiNote.sessionId = session.id;
            await db.updateSession(session.id, { transcription: encryptField(transcription), ai_notes: JSON.stringify(aiNote), status: 'draft' });
            console.log(`💾 Session saved with ID: ${session.id}`);
        }

        res.json(aiNote);
    } catch (error) {
        console.error(`❌ Note generation error:`, error.message || error);
        res.status(500).json({ error: error.message || 'Note generation failed' });
    }
});

app.get('/api/stats/:userId', authenticateToken, async (req, res) => {
    try {
        const rawStats = await db.getUserStats(req.params.userId);

        // Map database stats to the property names expected by the front-end
        const formattedStats = {
            todayEncounters: rawStats.sessionsToday,
            activePatients: rawStats.totalPatients,
            aiNotesGenerated: rawStats.aiNotesGenerated,
            timeSaved: Math.floor(rawStats.totalSessions * 5 / 60)
        };

        res.json(formattedStats);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/patients', authenticateToken, async (req, res) => {
    try {
        const patients = await db.getAllPatients(req.query.userId);
        res.json(patients);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Return sessions for a specific patient (for the requesting user), with decrypted transcripts
app.get('/api/patients/:patientId/sessions', authenticateToken, async (req, res) => {
    try {
        const { patientId } = req.params;
        const { userId } = req.query;
        if (!userId || !patientId) return res.status(400).json({ error: 'Missing userId or patientId' });
        const [rows] = await db.promisePool.query(
            'SELECT id, user_id, patient_id, domain, transcription, status, created_at FROM sessions WHERE user_id = ? AND patient_id = ? ORDER BY created_at DESC',
            [userId, patientId]
        );
        const sessions = rows.map(r => ({
            id: r.id,
            patient_id: r.patient_id,
            status: r.status,
            created_at: r.created_at,
            transcription: decryptField(r.transcription)
        }));
        res.json(sessions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/patients', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'Missing userId' });
        }
        const result = await db.createPatient(req.body);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/sessions', authenticateToken, async (req, res) => {
    try {
        const sessions = await db.getAllSessions(req.query.userId);
        // Decrypt the encrypted fields before returning
        const decryptedSessions = sessions.map(session => ({
            ...session,
            transcription: session.transcription ? decryptField(session.transcription) : null,
            ai_notes: session.ai_notes ? decryptField(session.ai_notes) : null
        }));
        res.json(decryptedSessions);
    } catch (error) {
        console.error('Error fetching sessions:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.put('/api/sessions/:id', authenticateToken, async (req, res) => {
    try {
        await db.updateSession(req.params.id, req.body);
        res.json({ message: 'Session updated' });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// ----- Admin & Password Reset APIs -----
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const rows = await db.getAllUsers();
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.put('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await db.updateUserProfile(req.params.userId, req.body);
        res.json({ message: 'User updated' });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.delete('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await db.deleteUser(req.params.userId);
        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Password reset - send token to user's email (placeholder, logs for now)
app.post('/api/request-password-reset', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'Missing userId' });

        // Check if user exists
        const user = await db.getUserById(userId);
        if (!user) {
            // Don't reveal if user exists
            return res.json({ message: 'If the user exists, a reset link would be sent' });
        }

        const token = crypto.randomBytes(24).toString('hex');
        const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
        await db.setResetToken(userId, token, expires);

        // Log token for development (replace with email in production)
        console.log(`🔑 Password reset token for ${userId}: ${token}`);
        res.json({ message: 'Reset requested. Check server logs for token (email not configured).' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to request reset' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) return res.status(400).json({ error: 'Missing fields' });
        if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

        const user = await db.findUserByResetToken(token);
        if (!user) return res.status(400).json({ error: 'Invalid or expired token' });

        await db.clearResetTokenAndSetPassword(user.user_id, newPassword);
        res.json({ message: 'Password reset successful' });
    } catch (error) {
        res.status(500).json({ error: 'Reset failed' });
    }
});

// QR code generation endpoint
app.get('/api/qr', authenticateToken, async (req, res) => {
    try {
        const { data } = req.query;
        if (!data) return res.status(400).json({ error: 'Missing data parameter' });
        const qrDataUrl = await QRCode.toDataURL(decodeURIComponent(data), { width: 300, margin: 2 });
        res.json({ qr: qrDataUrl });
    } catch (error) {
        console.error('QR generation error:', error);
        res.status(500).json({ error: 'QR generation failed' });
    }
});

// Mobile microphone relay page
app.get('/mobile-mic', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mobile-mic.html'));
});

const server = app.listen(PORT, () => {
    console.log(`\n✅ Clinivoice Server Running`);
    console.log(`🚀 http://localhost:${PORT}`);
    console.log(`🖥️  Desktop: http://localhost:${PORT}/desktop\n`);
});

// WebSocket relay for mobile microphone transcription
const wss = new WebSocket.Server({ server, path: '/ws' });
const relaySessions = new Map(); // sessionId -> { desktop: ws, mobile: ws, desktopUserId: string }

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://localhost`);
    const sessionId = url.searchParams.get('session');
    const role = url.searchParams.get('role'); // 'desktop' or 'mobile'
    const token = url.searchParams.get('token');

    if (!sessionId || !role) {
        ws.close(1008, 'Missing session or role');
        return;
    }

    // Authenticate desktop connections
    let desktopUserId = null;
    if (role === 'desktop') {
        if (!token) {
            ws.close(1008, 'Missing authentication token');
            return;
        }
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            desktopUserId = decoded.userId;
            console.log(`🔐 WS desktop authenticated: user=${desktopUserId}`);
        } catch (err) {
            console.warn('🔐 WS desktop auth failed:', err.message);
            ws.close(1008, 'Invalid authentication token');
            return;
        }
    }

    if (!relaySessions.has(sessionId)) relaySessions.set(sessionId, {});
    const session = relaySessions.get(sessionId);
    session[role] = ws;
    if (desktopUserId) session.desktopUserId = desktopUserId;

    console.log(`🔌 WS ${role} connected for session ${sessionId}`);

    // Notify counterpart about connection
    const other = role === 'desktop' ? session.mobile : session.desktop;
    if (other && other.readyState === WebSocket.OPEN) {
        other.send(JSON.stringify({ type: 'peerConnected', role }));
    }

    ws.on('message', (message) => {
        const text = message.toString();
        try {
            const data = JSON.parse(text);
            // Relay to the other peer
            const targetRole = role === 'desktop' ? 'mobile' : 'desktop';
            const target = session[targetRole];
            if (target && target.readyState === WebSocket.OPEN) {
                target.send(JSON.stringify(data));
            }
        } catch (e) {
            // If not JSON, relay as plain text transcript
            const targetRole = role === 'desktop' ? 'mobile' : 'desktop';
            const target = session[targetRole];
            if (target && target.readyState === WebSocket.OPEN) {
                target.send(JSON.stringify({ type: 'transcript', text: text }));
            }
        }
    });

    ws.on('close', () => {
        console.log(`🔌 WS ${role} disconnected for session ${sessionId}`);
        if (session[role] === ws) session[role] = null;
        const other = role === 'desktop' ? session.mobile : session.desktop;
        if (other && other.readyState === WebSocket.OPEN) {
            other.send(JSON.stringify({ type: 'peerDisconnected', role }));
        }
        // Clean up empty sessions
        if (!session.desktop && !session.mobile) relaySessions.delete(sessionId);
    });

    ws.on('error', (err) => {
        console.error(`WS error for ${role}/${sessionId}:`, err.message);
    });
});
