// Database Module for Clinivoice - MySQL
require('dotenv').config();
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');

// Support Railway DATABASE_URL format
let dbConfig;
if (process.env.DATABASE_URL) {
    // Parse Railway MySQL URL: mysql://user:password@host:port/database
    const url = new URL(process.env.DATABASE_URL);
    dbConfig = {
        host: url.hostname,
        port: url.port || 3306,
        user: url.username,
        password: url.password,
        database: url.pathname.replace('/', ''),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    };
} else {
    dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: 'clinivoice_v2',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    };
}

const pool = mysql.createPool(dbConfig);
const promisePool = pool.promise();

console.log('✅ MySQL connection pool created');

async function initializeTables() {
    try {
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS patients (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(50),
                external_id VARCHAR(255),
                domain VARCHAR(50) NOT NULL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id),
                INDEX idx_domain (domain),
                INDEX idx_name (name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                patient_id INT,
                domain VARCHAR(50) NOT NULL,
                tooth_number VARCHAR(100),
                audio_url TEXT,
                transcription TEXT,
                ai_notes TEXT,
                status VARCHAR(50) DEFAULT 'recording',
                duration INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
                INDEX idx_user_id (user_id),
                INDEX idx_domain (domain),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255),
                domain VARCHAR(50) NOT NULL,
                email VARCHAR(255),
                role VARCHAR(50) DEFAULT 'clinician',
                reset_token VARCHAR(255) NULL,
                reset_expires DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL,
                INDEX idx_user_id (user_id),
                INDEX idx_domain (domain)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Ensure legacy tables have missing columns
        try {
            await promisePool.query('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)');
        } catch (e) {
            // ER_DUP_FIELDNAME = column already exists: safe to ignore
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }
        // Add tooth_number column if missing
        try {
            await promisePool.query('ALTER TABLE sessions ADD COLUMN tooth_number VARCHAR(100)');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }
        // Add user_id column to patients if missing (for user isolation)
        try {
            await promisePool.query('ALTER TABLE patients ADD COLUMN user_id VARCHAR(255) NOT NULL DEFAULT \'\'');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }
        // Add index on user_id for patients
        try {
            await promisePool.query('ALTER TABLE patients ADD INDEX idx_user_id (user_id)');
        } catch (e) {
            // Index may already exist
        }
        try {
            await promisePool.query('ALTER TABLE users ADD COLUMN name VARCHAR(255) NULL');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
        try {
            await promisePool.query('ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
        try {
            await promisePool.query('ALTER TABLE patients ADD COLUMN external_id VARCHAR(255)');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
        try {
            await promisePool.query("ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'clinician'");
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
        try {
            await promisePool.query('ALTER TABLE users ADD COLUMN reset_token VARCHAR(255) NULL');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
        try {
            await promisePool.query('ALTER TABLE users ADD COLUMN reset_expires DATETIME NULL');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

        // Create default admin user if none exists (avoid hoisting issues)
        const [adminExists] = await promisePool.query('SELECT id FROM users WHERE user_id = ? LIMIT 1', ['admin']);
        if (adminExists.length === 0) {
            const hash = await bcrypt.hash('Admin@123', 10);
            await promisePool.query(
                'INSERT INTO users (user_id, domain, password_hash) VALUES (?, ?, ?)',
                ['admin', 'medical', hash]
            );
            console.log('🔑 Default admin user created: admin / Admin@123');
        } else {
            console.log('ℹ️  Admin user already exists');
        }

        console.log('✅ Database tables ready');
    } catch (error) {
        console.error('Error initializing tables:', error);
    }
}

initializeTables();

// Database helper functions (simplified for brevity)
const getAllPatients = async (userId) => {
    const query = userId ? 'SELECT * FROM patients WHERE user_id = ? ORDER BY created_at DESC' : 'SELECT * FROM patients ORDER BY created_at DESC';
    const params = userId ? [userId] : [];
    const [rows] = await promisePool.query(query, params);
    return rows;
};

const createPatient = async (data) => {
    const { name, email, phone, domain, notes, external_id = null, user_id } = data;
    const [result] = await promisePool.query(
        'INSERT INTO patients (name, email, phone, external_id, domain, notes, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [name, email, phone, external_id, domain, notes, user_id]
    );
    return { id: result.insertId };
};

// Ensure a patient exists by name for a specific user; return patient id
const ensurePatientByName = async ({ name, domain, user_id }) => {
    const [[row]] = await promisePool.query('SELECT id FROM patients WHERE name = ? AND domain = ? AND user_id = ? LIMIT 1', [name, domain, user_id]);
    if (row && row.id) return row.id;
    const [result] = await promisePool.query('INSERT INTO patients (name, domain, user_id) VALUES (?, ?, ?)', [name, domain, user_id]);
    return result.insertId;
};

const getAllSessions = async (userId) => {
    const query = userId
        ? 'SELECT s.*, p.name as patient_name FROM sessions s LEFT JOIN patients p ON s.patient_id = p.id WHERE s.user_id = ? ORDER BY s.created_at DESC'
        : 'SELECT s.*, p.name as patient_name FROM sessions s LEFT JOIN patients p ON s.patient_id = p.id ORDER BY s.created_at DESC';
    const params = userId ? [userId] : [];
    const [rows] = await promisePool.query(query, params);
    return rows;
};

const createSession = async (data) => {
    const { user_id, patient_id, domain } = data;
    const [result] = await promisePool.query(
        'INSERT INTO sessions (user_id, patient_id, domain, status) VALUES (?, ?, ?, ?)',
        [user_id, patient_id, domain, 'recording']
    );
    return { id: result.insertId };
};

const updateSession = async (id, data) => {
    const updates = [];
    const params = [];

    if (data.transcription !== undefined) { updates.push('transcription = ?'); params.push(data.transcription); }
    if (data.ai_notes !== undefined) { updates.push('ai_notes = ?'); params.push(data.ai_notes); }
    if (data.status !== undefined) { updates.push('status = ?'); params.push(data.status); }
    if (data.audio_url !== undefined) { updates.push('audio_url = ?'); params.push(data.audio_url); }
    if (data.duration !== undefined) { updates.push('duration = ?'); params.push(data.duration); }
    if (data.tooth_number !== undefined) { updates.push('tooth_number = ?'); params.push(data.tooth_number); }

    params.push(id);
    const sql = `UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`;
    await promisePool.query(sql, params);
};

const createUser = async ({ user_id, password, domain, role = 'clinician', name = null, email = null }) => {
    const password_hash = await bcrypt.hash(password, 10);
    // 1) Insert minimal required columns to avoid legacy column errors
    try {
        await promisePool.query(
            'INSERT INTO users (user_id, domain, password_hash, role) VALUES (?, ?, ?, ?)',
            [user_id, domain, password_hash, role]
        );
    } catch (e) {
        // Create required columns if missing, then retry minimal insert
        const msg = String(e && (e.sqlMessage || e.message) || '')
        if (msg.includes('password_hash')) {
            await promisePool.query('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)');
        }
        if (msg.includes("'domain'")) {
            await promisePool.query("ALTER TABLE users ADD COLUMN domain VARCHAR(50) NOT NULL DEFAULT 'medical'");
        }
        if (msg.includes("'role'")) {
            await promisePool.query("ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'clinician'");
        }
        await promisePool.query(
            'INSERT INTO users (user_id, domain, password_hash, role) VALUES (?, ?, ?, ?)',
            [user_id, domain, password_hash, role]
        );
    }

    // 2) Update optional columns if provided
    if (name != null || email != null) {
        const sets = []
        const params = []
        if (name != null) { sets.push('name = ?'); params.push(name) }
        if (email != null) { sets.push('email = ?'); params.push(email) }
        if (sets.length) {
            try {
                params.push(user_id)
                await promisePool.query(`UPDATE users SET ${sets.join(', ')} WHERE user_id = ?`, params)
            } catch (e) {
                const msg = String(e && (e.sqlMessage || e.message) || '')
                if (msg.includes("'name'")) {
                    await promisePool.query('ALTER TABLE users ADD COLUMN name VARCHAR(255) NULL')
                }
                if (msg.includes("'email'")) {
                    await promisePool.query('ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL')
                }
                // retry once after adding
                const sets2 = []
                const params2 = []
                if (name != null) { sets2.push('name = ?'); params2.push(name) }
                if (email != null) { sets2.push('email = ?'); params2.push(email) }
                if (sets2.length) {
                    params2.push(user_id)
                    await promisePool.query(`UPDATE users SET ${sets2.join(', ')} WHERE user_id = ?`, params2)
                }
            }
        }
    }
};

const verifyUser = async ({ user_id, password }) => {
    const [[user]] = await promisePool.query('SELECT * FROM users WHERE user_id = ?', [user_id]);
    if (!user) return null;
    const match = await bcrypt.compare(password, user.password_hash);
    return match ? user : null;
};

const getAllUsers = async () => {
    const [rows] = await promisePool.query('SELECT id, user_id, name, email, domain, role, created_at, last_login FROM users ORDER BY created_at DESC');
    return rows;
};

const updateUserProfile = async (user_id, data) => {
    const updates = [];
    const params = [];
    if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
    if (data.email !== undefined) { updates.push('email = ?'); params.push(data.email); }
    if (data.domain !== undefined) { updates.push('domain = ?'); params.push(data.domain); }
    if (data.role !== undefined) { updates.push('role = ?'); params.push(data.role); }
    if (data.password) {
        const hash = await bcrypt.hash(data.password, 10);
        updates.push('password_hash = ?'); params.push(hash);
    }
    if (updates.length === 0) return;
    params.push(user_id);
    await promisePool.query(`UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`, params);
};

const deleteUser = async (user_id) => {
    await promisePool.query('DELETE FROM sessions WHERE user_id = ?', [user_id]);
    await promisePool.query('DELETE FROM users WHERE user_id = ?', [user_id]);
};

const setResetToken = async (user_id, token, expires) => {
    await promisePool.query('UPDATE users SET reset_token = ?, reset_expires = ? WHERE user_id = ?', [token, expires, user_id]);
};

const findUserByResetToken = async (token) => {
    const now = new Date();
    const [[user]] = await promisePool.query('SELECT * FROM users WHERE reset_token = ? AND reset_expires > ?', [token, now]);
    return user || null;
};

const clearResetTokenAndSetPassword = async (user_id, newPassword) => {
    const hash = await bcrypt.hash(newPassword, 10);
    await promisePool.query('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE user_id = ?', [hash, user_id]);
};

const getUserStats = async (userId) => {
    const [[sessionsCount]] = await promisePool.query('SELECT COUNT(*) as total FROM sessions WHERE user_id = ?', [userId]);
    const [[patientsCount]] = await promisePool.query('SELECT COUNT(*) as total FROM patients WHERE user_id = ?', [userId]);
    const [[todayCount]] = await promisePool.query('SELECT COUNT(*) as total FROM sessions WHERE user_id = ? AND DATE(created_at) = CURDATE()', [userId]);

    return {
        totalSessions: sessionsCount.total,
        totalPatients: patientsCount.total,
        sessionsToday: todayCount.total,
        aiNotesGenerated: sessionsCount.total,
    };
};

module.exports = {
    pool,
    promisePool,
    getAllPatients,
    createPatient,
    ensurePatientByName,
    getAllSessions,
    createSession,
    updateSession,
    getUserStats,
    createUser,
    verifyUser,
    getAllUsers,
    updateUserProfile,
    deleteUser,
    setResetToken,
    findUserByResetToken,
    clearResetTokenAndSetPassword
};
