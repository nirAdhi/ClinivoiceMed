import { useState, useEffect } from 'react'
import Login from './components/Login'
import MainDashboard from './components/MainDashboard'

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [user, setUser] = useState(null)
    const [theme, setTheme] = useState('dark')

    useEffect(() => {
        const savedTheme = localStorage.getItem('theme') || 'dark'
        setTheme(savedTheme)
        document.documentElement.setAttribute('data-theme', savedTheme)
    }, [])

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark'
        setTheme(newTheme)
        localStorage.setItem('theme', newTheme)
        document.documentElement.setAttribute('data-theme', newTheme)
    }

    const handleLogin = (userId, domain) => {
        setUser({ userId, domain })
        setIsAuthenticated(true)
    }

    const handleLogout = () => {
        setUser(null)
        setIsAuthenticated(false)
    }

    return (
        <div>
            {!isAuthenticated ? (
                <Login onLogin={handleLogin} theme={theme} onToggleTheme={toggleTheme} />
            ) : (
                <MainDashboard user={user} onLogout={handleLogout} theme={theme} onToggleTheme={toggleTheme} />
            )}
        </div>
    )
}

export default App
