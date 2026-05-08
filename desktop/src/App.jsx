import { useState, useEffect } from 'react'
import Login from './components/Login'
import MainDashboard from './components/MainDashboard'

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [user, setUser] = useState(null)
    const [token, setToken] = useState(null)
    const [theme, setTheme] = useState('dark')

    useEffect(() => {
        const savedTheme = localStorage.getItem('theme') || 'dark'
        setTheme(savedTheme)
        document.documentElement.setAttribute('data-theme', savedTheme)

        // Check for saved token on mount
        const savedToken = localStorage.getItem('clinivoice_token')
        const savedUser = localStorage.getItem('clinivoice_user')
        if (savedToken && savedUser) {
            setToken(savedToken)
            setUser(JSON.parse(savedUser))
            setIsAuthenticated(true)
        }
    }, [])

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark'
        setTheme(newTheme)
        localStorage.setItem('theme', newTheme)
        document.documentElement.setAttribute('data-theme', newTheme)
    }

    const handleLogin = (userData, authToken) => {
        setUser(userData)
        setToken(authToken)
        setIsAuthenticated(true)
        localStorage.setItem('clinivoice_token', authToken)
        localStorage.setItem('clinivoice_user', JSON.stringify(userData))
    }

    const handleLogout = () => {
        setUser(null)
        setToken(null)
        setIsAuthenticated(false)
        localStorage.removeItem('clinivoice_token')
        localStorage.removeItem('clinivoice_user')
    }

    return (
        <div>
            {!isAuthenticated ? (
                <Login onLogin={handleLogin} theme={theme} onToggleTheme={toggleTheme} />
            ) : (
                <MainDashboard user={user} token={token} onLogout={handleLogout} theme={theme} onToggleTheme={toggleTheme} />
            )}
        </div>
    )
}

export default App
