import { useEffect, useState } from 'react'

function AdminPanel({ onClose }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editUserId, setEditUserId] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', domain: 'dental', role: 'clinician', password: '' })

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/users?adminId=admin')
      if (!res.ok) throw new Error('Failed to load users')
      const data = await res.json()
      setUsers(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  const startEdit = (u) => {
    setEditUserId(u.user_id)
    setForm({
      name: u.name || '',
      email: u.email || '',
      domain: u.domain || 'dental',
      role: u.role || 'clinician',
      password: ''
    })
  }

  const saveEdit = async () => {
    try {
      const body = { name: form.name, email: form.email, domain: form.domain, role: form.role }
      if (form.password) body.password = form.password
      const res = await fetch(`/api/admin/users/${encodeURIComponent(editUserId)}?adminId=admin`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error('Update failed')
      setEditUserId(null)
      setForm({ name: '', email: '', domain: 'medical', role: 'clinician', password: '' })
      await fetchUsers()
      alert('User updated')
    } catch (e) {
      alert(e.message || 'Failed')
    }
  }

  const deleteUser = async (user_id) => {
    if (!confirm(`Delete user ${user_id}? This also deletes their sessions.`)) return
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user_id)}?adminId=admin`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      await fetchUsers()
      alert('User deleted')
    } catch (e) {
      alert(e.message || 'Failed')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2>👑 Admin - Users</h2>
        {loading ? (
          <p>Loading...</p>
        ) : error ? (
          <p style={{ color: 'crimson' }}>{error}</p>
        ) : (
          <div className="admin-users">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Domain</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.user_id}>
                    <td>{u.user_id}</td>
                    <td>{editUserId === u.user_id ? (
                      <input value={form.name} onChange={e=>setForm({ ...form, name: e.target.value })} />
                    ) : (u.name || '-')}</td>
                    <td>{editUserId === u.user_id ? (
                      <input value={form.email} onChange={e=>setForm({ ...form, email: e.target.value })} />
                    ) : (u.email || '-')}</td>
                    <td>{editUserId === u.user_id ? (
                      <select value={form.domain} onChange={e=>setForm({ ...form, domain: e.target.value })}>
                        <option value="dental">dental</option>
                      </select>
                    ) : u.domain}</td>
                    <td>{editUserId === u.user_id ? (
                      <select value={form.role} onChange={e=>setForm({ ...form, role: e.target.value })}>
                        <option value="clinician">clinician</option>
                        <option value="admin">admin</option>
                      </select>
                    ) : (u.role || 'clinician')}</td>
                    <td>{new Date(u.created_at).toLocaleString()}</td>
                    <td>{u.last_login ? new Date(u.last_login).toLocaleString() : '-'}</td>
                    <td className="admin-actions">
                      {editUserId === u.user_id ? (
                        <>
                          <input type="password" placeholder="Set new password (optional)" value={form.password} onChange={e=>setForm({ ...form, password: e.target.value })} />
                          <button onClick={saveEdit}>Save</button>
                          <button onClick={()=>setEditUserId(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={()=>startEdit(u)}>Edit</button>
                          <button onClick={()=>deleteUser(u.user_id)} className="danger">Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default AdminPanel
