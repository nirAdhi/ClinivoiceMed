import { useState } from 'react'
import './Login.css'
import { FileTextIcon } from './Icons'

function Login({ onLogin, theme, onToggleTheme }) {
    const [mode, setMode] = useState('login') // login | register | forgot | reset
    const [userId, setUserId] = useState('')
    const [password, setPassword] = useState('')
    const [domain, setDomain] = useState('')
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [resetToken, setResetToken] = useState('')
    const [newPassword, setNewPassword] = useState('')

    const [captchaQ, setCaptchaQ] = useState(() => {
        const a = Math.floor(Math.random() * 10) + 1
        const b = Math.floor(Math.random() * 10) + 1
        return { text: `${a} + ${b}`, answer: a + b }
    })
    const [captchaInput, setCaptchaInput] = useState('')
    const [authError, setAuthError] = useState('')
    const [showPass, setShowPass] = useState(false)
    const [showRegPass, setShowRegPass] = useState(false)
    const [showResetPass, setShowResetPass] = useState(false)
    const [logoLoaded, setLogoLoaded] = useState(false)

    const regenCaptcha = () => {
        const a = Math.floor(Math.random() * 10) + 1
        const b = Math.floor(Math.random() * 10) + 1
        setCaptchaQ({ text: `${a} + ${b}`, answer: a + b })
        setCaptchaInput('')
    }

    const submitLogin = async (e) => {
        e.preventDefault()
        setAuthError('')
        if (parseInt(captchaInput, 10) !== captchaQ.answer) { setAuthError('Captcha incorrect'); regenCaptcha(); return }
        try {
            const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, password }) })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Invalid credentials')
            const { domain: userDomain } = data
            onLogin(userId, userDomain)
        } catch (err) { setAuthError(err.message || 'Login failed') }
    }

    const submitRegister = async (e) => {
        e.preventDefault()
        try {
            setAuthError('')
            const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, password, domain: domain || 'dental', name, email }) })
            const data = await res.json().catch(()=>({}))
            if (!res.ok) throw new Error((data && data.error) || (res.status === 409 ? 'User already exists' : 'Registration failed'))
            setMode('login')
        } catch (err) { setAuthError(err.message || 'Registration failed') }
    }

    const submitForgot = async (e) => {
        e.preventDefault()
        try {
            const res = await fetch('/api/request-password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed')
            setResetToken(data.token) // In production: token emailed. For dev: show in UI.
            setMode('reset')
        } catch (err) { alert(err.message || 'Failed') }
    }

    const submitReset = async (e) => {
        e.preventDefault()
        try {
            const res = await fetch('/api/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: resetToken, newPassword }) })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Reset failed')
            setMode('login')
        } catch (err) { setAuthError(err.message || 'Failed') }
    }

    return (
        <div className="login-container">
            <button className="theme-toggle-btn" onClick={onToggleTheme}>
                {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            <div className="login-card">
                <div className="brand-lockup">
                    <img src="clinivoice-logo.png" alt="Clinvoice AI" onLoad={()=>setLogoLoaded(true)} onError={(e)=>{ e.currentTarget.style.display='none'; setLogoLoaded(false) }} />
                    {!logoLoaded && <FileTextIcon />}
                    <div className="brand-caption">Clinvoice <span>AI</span></div>
                </div>

                <h1>Welcome Back</h1>
                <p>Sign in to continue</p>

                {mode === 'login' && (
                    <form onSubmit={submitLogin}>
                        <div className="input-row">
                            <input type="text" placeholder="Username or Email" value={userId} onChange={(e) => setUserId(e.target.value)} required />
                            <span className="right-icon" aria-hidden>👤</span>
                        </div>
                        <div className="input-row">
                            <input type={showPass ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            <button type="button" className="right-action" onClick={()=>setShowPass(p=>!p)} aria-label="Toggle password">
                                {showPass ? '🙈' : '👁️'}
                            </button>
                        </div>
                        {/* domain selection omitted in login to match design; backend returns domain */}
                        <div className="captcha-row">
                            <label className="captcha-label">Captcha:</label>
                            <div className="captcha-box">{captchaQ.text}</div>
                            <button type="button" className="captcha-refresh" onClick={regenCaptcha} title="Refresh captcha">↻</button>
                        </div>
                        <input className="captcha-input" type="number" value={captchaInput} onChange={(e) => setCaptchaInput(e.target.value)} placeholder="Enter captcha answer" required />
                        {authError && <div className="auth-error" role="alert">{authError}</div>}
                        <button type="submit">Sign In</button>
                        <div style={{ marginTop: 12, textAlign: 'left' }}>
                            <a href="#" onClick={(e)=>{e.preventDefault(); setMode('forgot')}}>Forgot Password?</a>
                            <span style={{ float: 'right' }}>
                                Don't have an account? <a href="#" onClick={(e)=>{e.preventDefault(); setMode('register')}}>Register Now</a>
                            </span>
                        </div>
                    </form>
                )}

                {mode === 'register' && (
                    <form onSubmit={submitRegister}>
                        <input type="text" placeholder="User ID" value={userId} onChange={(e)=>setUserId(e.target.value)} required />
                        <div className="input-row">
                            <input type={showRegPass ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} required />
                            <button type="button" className="right-action" onClick={()=>setShowRegPass(p=>!p)} aria-label="Toggle password">{showRegPass ? '🙈' : '👁️'}</button>
                        </div>
                        <input type="text" placeholder="Full Name (optional)" value={name} onChange={(e)=>setName(e.target.value)} />
                        <input type="email" placeholder="Email (optional)" value={email} onChange={(e)=>setEmail(e.target.value)} />
                        <select value={domain} onChange={(e)=>setDomain(e.target.value)} required>
                            <option value="">Select Domain</option>
                            <option value="dental">🦷 Dental</option>
                            <option value="medical">🏥 Medical</option>
                        </select>
                        {authError && <div className="auth-error" role="alert">{authError}</div>}
                        <button type="submit">Create Account</button>
                        <div style={{ marginTop: 12 }}>
                            Already have an account? <a href="#" onClick={(e)=>{e.preventDefault(); setMode('login')}}>Sign In</a>
                        </div>
                    </form>
                )}

                {mode === 'forgot' && (
                    <form onSubmit={submitForgot}>
                        <input type="text" placeholder="Enter your User ID" value={userId} onChange={(e)=>setUserId(e.target.value)} required />
                        <button type="submit">Request Reset</button>
                        <div style={{ marginTop: 12 }}>
                            <a href="#" onClick={(e)=>{e.preventDefault(); setMode('login')}}>Back to Sign In</a>
                        </div>
                    </form>
                )}

                {mode === 'reset' && (
                    <form onSubmit={submitReset}>
                        <input type="text" placeholder="Paste reset token" value={resetToken} onChange={(e)=>setResetToken(e.target.value)} required />
                        <div className="input-row">
                            <input type={showResetPass ? 'text' : 'password'} placeholder="New Password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} required />
                            <button type="button" className="right-action" onClick={()=>setShowResetPass(p=>!p)} aria-label="Toggle password">{showResetPass ? '🙈' : '👁️'}</button>
                        </div>
                        {authError && <div className="auth-error" role="alert">{authError}</div>}
                        <button type="submit">Set New Password</button>
                        <div style={{ marginTop: 12 }}>
                            <a href="#" onClick={(e)=>{e.preventDefault(); setMode('login')}}>Back to Sign In</a>
                        </div>
                    </form>
                )}

                <div className="login-footer-links">
                    <a href="#">Secure Login</a>
                    <a href="#">Terms of Service</a>
                    <a href="#">Privacy Policy</a>
                </div>
            </div>
        </div>
    )
}

export default Login
