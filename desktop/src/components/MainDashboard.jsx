import { useState, useEffect, useRef } from 'react'
import './MainDashboard.css'
import { CalendarIcon, UsersIcon, SparklesIcon, TimerIcon, MicIcon, FileTextIcon } from './Icons'
import AdminPanel from './AdminPanel'

function MainDashboard({ user, token, onLogout, theme, onToggleTheme }) {
  const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token || localStorage.getItem('clinivoice_token') || ''}`
  })

  const [stats, setStats] = useState({ todayEncounters: 0, activePatients: 0, aiNotesGenerated: 0, timeSaved: 0 })
  const [transcription, setTranscription] = useState('')
  const [aiNote, setAiNote] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recentEncounters, setRecentEncounters] = useState([])
  const recognitionRef = useRef(null)
  const finalTranscriptRef = useRef('')
  const isRecordingStateRef = useRef(isRecording)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const [audioBlob, setAudioBlob] = useState(null)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [savePatientName, setSavePatientName] = useState('')
  const [saveToothNumber, setSaveToothNumber] = useState('')
  const [saveType, setSaveType] = useState('both') // 'ai', 'raw', 'both'
  const [showSaveDropdown, setShowSaveDropdown] = useState(false)
  const [showPatientsModal, setShowPatientsModal] = useState(false)
  const [patientsList, setPatientsList] = useState([])
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [copyPreview, setCopyPreview] = useState('')
  const [toasts, setToasts] = useState([])
  const [showTranscriptView, setShowTranscriptView] = useState(false)
  const [transcriptViewText, setTranscriptViewText] = useState('')
  const [autoGenerate, setAutoGenerate] = useState(false)
  const [headerLogoLoaded, setHeaderLogoLoaded] = useState(false)
  const [viewingEncounter, setViewingEncounter] = useState(null)

  // Mic source & QR relay state
  const [micSource, setMicSource] = useState('computer') // 'computer' | 'mobile'
  const [showQrModal, setShowQrModal] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [wsDesktop, setWsDesktop] = useState(null)
  const [mobileConnected, setMobileConnected] = useState(false)
  const [relaySessionId, setRelaySessionId] = useState('')

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordChangeError, setPasswordChangeError] = useState('')
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState('')

  // Medical template selector
  const [selectedTemplate, setSelectedTemplate] = useState('')

  const TEMPLATES = [
    { id: '', name: 'No Template', description: 'Default note generation' },
    { id: 'general_consultation', name: 'General Consultation', description: 'Standard patient visit with chief complaint, history, and plan' },
    { id: 'soap_note', name: 'SOAP Note', description: 'Subjective, Objective, Assessment, Plan format' },
    { id: 'follow_up', name: 'Follow-up Visit', description: 'Review of ongoing treatment or condition monitoring' },
    { id: 'physical_exam', name: 'Physical Examination', description: 'Comprehensive physical assessment documentation' },
    { id: 'prescription_review', name: 'Prescription Review', description: 'Medication review and adjustment' },
    { id: 'urgent_care', name: 'Urgent Care', description: 'Acute complaint documentation' },
  ]

  useEffect(() => {
    fetch(`/api/stats/${user.userId}`, { headers: authHeaders() })
      .then(res => res.json())
      .then(setStats)
      .catch(console.error)

    fetch(`/api/sessions?userId=${user.userId}`, { headers: authHeaders() })
      .then(res => res.json())
      .then(data => setRecentEncounters(data.slice(0, 5)))
      .catch(console.error)
    try {
      const ag = localStorage.getItem('cv_auto_generate')
      if (ag != null) setAutoGenerate(ag === '1')
    } catch {}
  }, [user])

  const pushToast = (message, type = 'success', timeout = 3000) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), timeout)
  }

  // Derive default patient name from AI or transcription
  const guessNameFromTranscription = (text) => {
    const t = String(text || '')
    // Look for "Patient [Name]" pattern
    let m = t.match(/Patient\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/)
    if (m && m[1]) return m[1]
    // Look for "name is [Name]" pattern
    m = t.match(/name\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i)
    if (m && m[1]) return m[1]
    // Look for "Good morning [Name]" or "Hello [Name]" patterns
    m = t.match(/(?:Good\s+(?:morning|afternoon|evening)|Hello|Hi|Hey)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i)
    if (m && m[1]) return m[1]
    // Look for "How are you [Name]" patterns
    m = t.match(/How\s+are\s+you\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i)
    if (m && m[1]) return m[1]
    // Look for "this is [Name]" when introducing
    m = t.match(/this\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i)
    if (m && m[1]) return m[1]
    // Look for "I'm [Name]" pattern
    m = t.match(/I'm\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i)
    if (m && m[1]) return m[1]
    // Look for "gums [Name] your teeth" or similar dentist addressing patient
    m = t.match(/gums\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+your/i)
    if (m && m[1]) return m[1]
    // Look for dentist addressing patient directly "[Name] your teeth"
    m = t.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+your\s+(?:teeth|gums|mouth)/i)
    if (m && m[1]) return m[1]
    return ''
  }

  const derivePatientName = () => {
    const aiName = (aiNote && typeof aiNote.patient === 'string') ? aiNote.patient.trim() : ''
    if (aiName && !aiName.startsWith('[')) return aiName
    const guess = guessNameFromTranscription(transcription)
    return guess || ''
  }

  const openSaveTranscript = () => {
    setSavePatientName(derivePatientName())
    setSaveToothNumber('')
    setSaveType('both')
    setShowSaveModal(true)
  }

  const openSaveDropdown = () => {
    setSavePatientName(derivePatientName())
    setSaveToothNumber('')
    setShowSaveDropdown(true)
  }

  const selectSaveOption = (type) => {
    setSaveType(type)
    setShowSaveDropdown(false)
    setShowSaveModal(true)
  }

  const openPatientsList = async () => {
    try {
      const res = await fetch(`/api/patients?userId=${user.userId}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setPatientsList(data)
        setShowPatientsModal(true)
      } else {
        pushToast('Failed to load patients', 'error')
      }
    } catch (err) {
      console.error(err)
      pushToast('Failed to load patients', 'error')
    }
  }

  const saveTranscript = async () => {
    try {
      if (!transcription || transcription.trim().length === 0 && saveType !== 'ai') { 
        pushToast('No transcript to save', 'error'); 
        return 
      }
      if (!aiNote && (saveType === 'ai' || saveType === 'both')) {
        pushToast('No AI note generated yet', 'error');
        return
      }
      const patientName = (savePatientName || '').trim()
      const toothNumber = (saveToothNumber || '').trim()
      const dentistName = user?.userId || ''
      if (!patientName) { 
        pushToast('Please enter patient name', 'error'); 
        return 
      }
      
      // Generate preview text based on save type
      let previewText = ''
      if (saveType === 'ai' && aiNote) {
        previewText = formatNoteAsText(aiNote, selectedSections)
      } else if (saveType === 'raw') {
        previewText = transcription
      } else if (saveType === 'both') {
        previewText = `AI NOTE:\n${formatNoteAsText(aiNote, selectedSections)}\n\n---\n\nRAW TRANSCRIPT:\n${transcription}`
      }
      
      // Show preview first
      setPreviewData({ patientName, toothNumber, dentistName, transcript: transcription, aiSummary: aiNote, previewText, saveType })
      setShowPreviewModal(true)
    } catch (err) {
      console.error(err)
      pushToast(err.message || 'Failed to save transcript', 'error')
    }
  }

  const confirmSave = async () => {
    try {
      const payload = {
        userId: user.userId,
        domain: user?.domain || 'medical',
        patientName: previewData.patientName, 
        toothNumber: previewData.toothNumber,
        dentistName: previewData.dentistName,
        saveType: previewData.saveType,
        // Always include transcription to satisfy backend validation
        transcription: previewData.transcript || '[AI Note Only - No Transcript]'
      }
      
      // Include AI summary if needed
      if (previewData.saveType === 'ai' || previewData.saveType === 'both') {
        payload.aiSummary = previewData.aiSummary
      }
      
      const res = await fetch('/api/save-transcript-secure', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        let msg = `Save failed (HTTP ${res.status})`
        try { const e = await res.json(); if (e && e.error) msg = e.error } catch {}
        throw new Error(msg)
      }
      pushToast('Transcript saved securely', 'success')
      setShowPreviewModal(false)
      setShowSaveModal(false)
      // refresh recent encounters
      fetch(`/api/sessions?userId=${user.userId}`, { headers: authHeaders() }).then(r=>r.json()).then(d=>setRecentEncounters(d.slice(0,5))).catch(()=>{})
    } catch (err) {
      pushToast(err.message || 'Failed to save', 'error')
    }
  }

  // Handle start/stop of speech recognition
  const copyNoteToClipboard = () => {
    if (!aiNote) { alert('No note to copy'); return }
    const text = formatNoteAsText(aiNote, selectedSections)
    setCopyPreview(text)
    setShowCopyModal(true)
  }

  const downloadNoteTxt = () => {
    if (!aiNote) { alert('No note to save'); return }
    const text = formatNoteAsText(aiNote, selectedSections)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const d = new Date().toISOString().slice(0,10)
    a.download = `${(user?.domain === 'dental' ? 'Dental' : 'Medical')}Note_${d}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    if (!isRecording) {
      // stop any existing recognition and recorder
      recognitionRef.current?.stop?.()
      try { if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop() } catch {}
      return
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('SpeechRecognition API not supported in this browser.')
      setIsRecording(false)
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += transcript + ' '
        } else {
          interim += transcript
        }
      }
      setTranscription((finalTranscriptRef.current + interim).trim())
    }
    recognition.onerror = (e) => console.error('Recognition error', e)
    recognition.onend = () => {
      // Automatically restart if still recording (check latest state)
      if (isRecordingStateRef.current) recognition.start()
    }

    recognitionRef.current = recognition
    recognition.start()

    // Start media recorder (voice note)
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const recorder = new MediaRecorder(stream)
        audioChunksRef.current = []
        recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data) }
        recorder.onstop = () => {
          try {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
            setAudioBlob(blob)
          } catch {}
          stream.getTracks().forEach(t => t.stop())
        }
        recorder.start()
        mediaRecorderRef.current = recorder
      } catch (err) {
        console.warn('MediaRecorder unavailable', err)
      }
    })()

    return () => {
      recognition.stop()
      recognitionRef.current = null
    }
  }, [isRecording])

  useEffect(() => {
    isRecordingStateRef.current = isRecording
  }, [isRecording])

  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedSections, setSelectedSections] = useState(new Set())
  const toggleSection = (key) => {
    setSelectedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }
  const isSelected = (key) => selectedSections.has(key)
  const selectAllSections = () => {
    const keys = new Set([
      'header','chiefComplaint','historyOfPresentIllness','medicalHistory','dentalHistory','intraOralExamination','diagnosticProcedures','assessment','educationRecommendations','patientResponse','plan'
    ])
    setSelectedSections(keys)
  }
  const clearAllSections = () => setSelectedSections(new Set())

  const toggleRecording = () => {
    if (micSource === 'mobile') {
      // Show QR modal for mobile mic
      openQrModal()
      return
    }
    setIsRecording(prev => {
      const next = !prev
      if (next) {
        // reset transcription when starting fresh
        setTranscription('')
        finalTranscriptRef.current = ''
      }
      return next
    })
  }

  const openQrModal = async () => {
    const sid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)
    setRelaySessionId(sid)
    const mobileUrl = `${window.location.origin}/mobile-mic?session=${encodeURIComponent(sid)}`
    try {
      const res = await fetch(`/api/qr?data=${encodeURIComponent(mobileUrl)}`, { headers: authHeaders() })
      const data = await res.json()
      if (data.qr) {
        setQrDataUrl(data.qr)
        setShowQrModal(true)
        connectWsRelay(sid)
      } else {
        pushToast('Failed to generate QR code', 'error')
      }
    } catch (err) {
      console.error(err)
      pushToast('Failed to generate QR code', 'error')
    }
  }

  const connectWsRelay = (sid) => {
    if (wsDesktop) { try { wsDesktop.close() } catch {} }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const currentToken = token || localStorage.getItem('clinivoice_token') || ''
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws?session=${encodeURIComponent(sid)}&role=desktop&token=${encodeURIComponent(currentToken)}`)
    setWsDesktop(ws)
    ws.onopen = () => {
      console.log('Desktop WS connected')
    }
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'peerConnected' && data.role === 'mobile') {
          setMobileConnected(true)
          pushToast('Mobile microphone connected', 'success')
        }
        if (data.type === 'peerDisconnected' && data.role === 'mobile') {
          setMobileConnected(false)
        }
        if (data.type === 'transcript' && typeof data.text === 'string') {
          finalTranscriptRef.current = data.text
          setTranscription(data.text)
        }
      } catch (e) {}
    }
    ws.onclose = () => {
      setMobileConnected(false)
    }
    ws.onerror = (err) => {
      console.error('Desktop WS error', err)
    }
  }

  const closeQrModal = () => {
    setShowQrModal(false)
    if (wsDesktop) { try { wsDesktop.close() } catch {} }
    setWsDesktop(null)
    setMobileConnected(false)
  }

  // Auto-generate when recording stops with transcription
  useEffect(() => {
    if (!autoGenerate) return
    if (!isRecording && transcription.trim().length > 20 && !aiNote && !isGenerating) {
      const timer = setTimeout(() => { handleGenerate() }, 1000)
      return () => clearTimeout(timer)
    }
  }, [isRecording, transcription, autoGenerate])

  // ESC key handler to close modals
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (showPreviewModal) setShowPreviewModal(false)
        if (showSaveModal) setShowSaveModal(false)
        if (showPatientsModal) setShowPatientsModal(false)
        if (showSettings) setShowSettings(false)
        if (showCopyModal) setShowCopyModal(false)
        if (showQrModal) closeQrModal()
        if (viewingEncounter) setViewingEncounter(null)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [showPreviewModal, showSaveModal, showPatientsModal, showSettings, showCopyModal, showQrModal, viewingEncounter])

  const submitChangePassword = async (e) => {
    e.preventDefault()
    setPasswordChangeError('')
    setPasswordChangeSuccess('')
    if (!currentPassword || !newPassword) {
      setPasswordChangeError('Please fill in all fields')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordChangeError('New passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      setPasswordChangeError('New password must be at least 6 characters')
      return
    }
    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ currentPassword, newPassword })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to change password')
      setPasswordChangeSuccess('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordChangeError(err.message || 'Failed to change password')
    }
  }

  const handleGenerate = async () => {
    if (!transcription || transcription.trim().length === 0) {
      alert('Please record or type some text first')
      return
    }
    
    setIsGenerating(true)
    try {
      console.log('🚀 Sending generate request...')
      const res = await fetch('/api/generate-note', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          transcription: transcription.trim(),
          domain: user?.domain || 'medical',
          userId: user.userId,
          template: selectedTemplate || undefined
        })
      })
      
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Generation failed')
      }
      
      const note = await res.json()
      console.log('✅ Note received:', note)
      
      // Fix dentist name to use logged-in username if placeholder
      if (!note.dentist || note.dentist === '[Dentist Name]' || note.dentist.includes('[Dentist') || note.dentist.includes('Dentist Name')) {
        note.dentist = user?.userId || 'Dr. [Name]'
      }
      
      // Try to extract patient name from transcription if placeholder
      if (!note.patient || note.patient === '[Patient Name]' || note.patient.includes('[Patient')) {
        const extractedName = guessNameFromTranscription(transcription)
        note.patient = extractedName || '[Patient Name]'
      }
      
      setAiNote(note)

      // Sync stats after generating note
      setStats(prev => ({
        ...prev,
        aiNotesGenerated: prev.aiNotesGenerated + 1,
        todayEncounters: prev.todayEncounters + 1,
        timeSaved: prev.timeSaved + 0.5
      }))
    } catch (error) {
      console.error('❌ Error generating note:', error)
      alert(`Failed to generate note: ${error.message}`)
    } finally {
      setIsGenerating(false)
    }
  }

  // Build a paste-friendly plain text for dental notes
  const formatNoteAsText = (note, selected) => {
    if (!note) return ''
    const hasSel = selected && selected.size > 0
    const include = (k) => !hasSel || selected.has(k)
    const normalize = (s) => {
      const t = String(s || '').trim()
      if (!t) return ''
      if (t.includes('\n')) return t
      return t.replace(/([.?!])\s+/g, '$1\n')
    }
    if (note.chiefComplaint || (note.patient && note.visitType)) {
      const parts = []
      if (include('header')) {
        parts.push([
          `Patient: ${note.patient || ''}`,
          `Date: ${note.date || ''}`,
          `Dentist: ${note.dentist || ''}`,
          `Visit Type: ${note.visitType || ''}`
        ].join('\n'))
      }
      if (include('chiefComplaint')) parts.push(`Chief Complaint:\n${normalize(note.chiefComplaint)}`)
      if (include('historyOfPresentIllness')) parts.push(`History of Present Illness:\n${normalize(note.historyOfPresentIllness)}`)
      if (include('medicalHistory')) parts.push(`Medical History:\n${normalize(note.medicalHistory)}`)
      if (include('dentalHistory')) parts.push(`Dental History:\n${normalize(note.dentalHistory)}`)
      if (include('intraOralExamination')) parts.push(`Intraoral Examination:\n${normalize(note.intraOralExamination)}`)
      if (include('diagnosticProcedures')) parts.push(`Diagnostic Procedures:\n${normalize(note.diagnosticProcedures)}`)
      if (include('assessment')) parts.push(`Assessment:\n${normalize(note.assessment)}`)
      if (include('educationRecommendations')) parts.push(`Education & Recommendations:\n${normalize(note.educationRecommendations)}`)
      if (include('patientResponse')) parts.push(`Patient Response:\n${normalize(note.patientResponse)}`)
      if (include('plan')) parts.push(`Plan:\n${normalize(note.plan)}`)
      return parts.filter(Boolean).join('\n').trim()
    }
    const parts = []
    if (include('subjective')) parts.push(`Subjective:\n${normalize(note.subjective)}`)
    if (include('objective')) parts.push(`Objective:\n${normalize(note.objective)}`)
    if (include('assessment')) parts.push(`Assessment:\n${normalize(note.assessment)}`)
    if (include('plan')) parts.push(`Plan:\n${normalize(note.plan)}`)
    return parts.join('\n').trim()
  }

  return (
    <div className="app-container">
      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
      <header className="top-header">
        <div className="brand">
          <div className="brand-icon">
            <img src="clinivoice-logo.png" alt="Clinvoice AI" className="brand-logo" onLoad={()=>setHeaderLogoLoaded(true)} onError={(e)=>{ e.currentTarget.style.display='none'; setHeaderLogoLoaded(false) }} />
            {!headerLogoLoaded && <FileTextIcon />}
          </div>
          <div>
            <h1>Clinvoice AI</h1>
            <p>AI-Powered Clinical Documentation (Gemini)</p>
          </div>
        </div>
        <div className="header-actions">
          <button onClick={onToggleTheme} className="theme-btn" title="Toggle Theme">
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
          {user.userId === 'admin' ? (
            <button className="theme-btn" onClick={() => setShowAdmin(true)} title="Admin Panel">Admin</button>
          ) : (
            <span className="user-badge">{user.userId}</span>
          )}
          <button onClick={onLogout} className="theme-btn" title="Logout">Logout</button>
        </div>
      </header>

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
            <h2>⚙️ Settings</h2>
            <div className="settings-section">
              <p><strong>User:</strong> {user.userId}</p>
              <p><strong>Domain:</strong> {user.domain}</p>
              <p><strong>Theme:</strong> {theme}</p>
              <p><strong>AI Model:</strong> Google Gemini Pro</p>
              <label style={{display:'flex',alignItems:'center',gap:8}}>
                <input type="checkbox" checked={autoGenerate} onChange={(e)=>{ setAutoGenerate(e.target.checked); try { localStorage.setItem('cv_auto_generate', e.target.checked ? '1':'0') } catch {} }} />
                Auto-generate note when recording stops
              </label>
            </div>

            <div className="settings-section password-change-section">
              <h3>🔐 Change Password</h3>
              <form onSubmit={submitChangePassword}>
                <div className="input-row">
                  <input
                    type="password"
                    placeholder="Current Password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="input-row">
                  <input
                    type="password"
                    placeholder="New Password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="input-row">
                  <input
                    type="password"
                    placeholder="Confirm New Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                {passwordChangeError && <div className="auth-error" role="alert">{passwordChangeError}</div>}
                {passwordChangeSuccess && <div className="auth-success" role="alert">{passwordChangeSuccess}</div>}
                <button type="submit" className="save-note-btn">Update Password</button>
              </form>
            </div>

            <button onClick={() => setShowSettings(false)} className="modal-close-btn">Close</button>
          </div>
        </div>
      )}

      {showTranscriptView && (
        <div className="modal-overlay" onClick={() => setShowTranscriptView(false)}>
          <div className="modal-content copy-modal" onClick={(e)=>e.stopPropagation()}>
            <h2>📝 Transcript</h2>
            <textarea className="copy-preview-text" value={transcriptViewText} readOnly />
            <div className="note-actions">
              <button className="pdf-btn" onClick={()=>{ navigator.clipboard.writeText(transcriptViewText); pushToast('Copied to clipboard', 'success') }}>Copy</button>
              <button className="pdf-btn" onClick={()=>setShowTranscriptView(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showAdmin && (
        <AdminPanel onClose={() => setShowAdmin(false)} token={token} />
      )}

      {showCopyModal && (
        <div className="modal-overlay" onClick={() => setShowCopyModal(false)}>
          <div className="modal-content copy-modal" onClick={(e)=>e.stopPropagation()}>
            <textarea className="copy-preview-text" value={copyPreview} onChange={(e)=>setCopyPreview(e.target.value)} placeholder="Nothing selected yet" />
            <div className="note-actions">
              <button className="pdf-btn" onClick={async ()=>{ try { await navigator.clipboard.writeText(copyPreview); } catch { alert('Copy failed'); } }}>Copy</button>
              <button className="save-note-btn" onClick={()=>{ navigator.clipboard.writeText(copyPreview).then(()=>setShowCopyModal(false)); }}>Copy & Close</button>
              <button className="pdf-btn" onClick={()=>setShowCopyModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>💾 Save {saveType === 'ai' ? 'AI Note' : saveType === 'raw' ? 'Raw Transcript' : 'Both'}</h2>
            <div className="settings-section">
              <p><strong>Instructions:</strong> Enter patient name and tooth number to save securely. Dentist: <strong>{user?.userId}</strong></p>
              <label>
                Patient Name
                <input type="text" value={savePatientName} onChange={e=>setSavePatientName(e.target.value)} className="mrn-input" placeholder="e.g., John Doe" />
              </label>
              <label>
                Tooth Number / Area
                <input type="text" value={saveToothNumber} onChange={e=>setSaveToothNumber(e.target.value)} className="mrn-input" placeholder="e.g., Lower right molar #30" />
              </label>
            </div>
            <div className="note-actions">
              <button className="save-note-btn" onClick={saveTranscript}>✅ Preview & Save</button>
              <button className="pdf-btn" onClick={()=>setShowSaveModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showPreviewModal && (
        <div className="modal-overlay" onClick={() => setShowPreviewModal(false)}>
          <div className="modal-content copy-modal" onClick={(e) => e.stopPropagation()}>
            <h2>🔒 Preview - {previewData?.saveType === 'ai' ? 'AI Note Only' : previewData?.saveType === 'raw' ? 'Raw Transcript Only' : 'Both AI & Raw'}</h2>
            <div className="settings-section">
              <label style={{marginBottom: '12px', display: 'block'}}>
                <strong>Patient:</strong>
                <input 
                  type="text" 
                  value={previewData?.patientName || ''} 
                  onChange={(e) => setPreviewData(prev => ({...prev, patientName: e.target.value}))}
                  className="mrn-input"
                  style={{marginTop: '6px', display: 'block', width: '100%', padding: '8px 12px', fontSize: '14px'}}
                  placeholder="Enter patient name"
                />
              </label>
              <label style={{marginBottom: '12px', display: 'block'}}>
                <strong>Tooth Number/Area:</strong>
                <input 
                  type="text" 
                  value={previewData?.toothNumber || ''} 
                  onChange={(e) => setPreviewData(prev => ({...prev, toothNumber: e.target.value}))}
                  className="mrn-input"
                  style={{marginTop: '6px', display: 'block', width: '100%', padding: '8px 12px', fontSize: '14px'}}
                  placeholder="e.g., Lower right molar #30"
                />
              </label>
              <p><strong>Dentist:</strong> {previewData?.dentistName}</p>
              <p><strong>Save Type:</strong> {previewData?.saveType === 'ai' ? '🤖 AI Note Only' : previewData?.saveType === 'raw' ? '📝 Raw Transcript Only' : '📋 Both AI & Raw'}</p>
              {previewData?.saveType === 'raw' && (
                <p><strong>Transcript Length:</strong> {previewData?.transcript?.length} characters</p>
              )}
              {previewData?.saveType === 'ai' && previewData?.aiSummary && (
                <div className="ai-summary-preview" style={{marginTop: '10px', padding: '10px', background: '#f8fafc', borderRadius: '6px'}}>
                  <strong>AI Note Preview:</strong>
                  <pre style={{whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '14px', marginTop: '8px', maxHeight: '200px', overflow: 'auto'}}>{previewData.previewText}</pre>
                </div>
              )}
              {previewData?.saveType === 'both' && previewData?.aiSummary && (
                <div className="ai-summary-preview" style={{marginTop: '10px', padding: '10px', background: '#f8fafc', borderRadius: '6px'}}>
                  <strong>Preview (AI Note + Raw Transcript):</strong>
                  <pre style={{whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '14px', marginTop: '8px', maxHeight: '200px', overflow: 'auto'}}>{previewData.previewText}</pre>
                </div>
              )}
              {previewData?.saveType === 'raw' && (
                <div className="ai-summary-preview" style={{marginTop: '10px', padding: '10px', background: '#f8fafc', borderRadius: '6px'}}>
                  <strong>Raw Transcript Preview:</strong>
                  <pre style={{whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '14px', marginTop: '8px', maxHeight: '200px', overflow: 'auto'}}>{previewData.transcript?.slice(0, 1000)}{previewData.transcript?.length > 1000 ? '...' : ''}</pre>
                </div>
              )}
              <small style={{color: '#64748b', display: 'block', marginTop: '10px'}}>This will be saved securely with encryption.</small>
            </div>
            <div className="note-actions">
              <button className="save-note-btn" onClick={confirmSave}>🔒 Confirm Save</button>
              <button className="pdf-btn" onClick={()=>setShowPreviewModal(false)}>Edit</button>
            </div>
          </div>
        </div>
      )}

      {showPatientsModal && (
        <div className="modal-overlay" onClick={() => setShowPatientsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>👥 Active Patients</h2>
            <div className="settings-section">
              {patientsList.length > 0 ? (
                <table style={{width: '100%', borderCollapse: 'collapse'}}>
                  <thead>
                    <tr>
                      <th style={{textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0'}}>Name</th>
                      <th style={{textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0'}}>Phone</th>
                      <th style={{textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0'}}>Last Visit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientsList.map(p => (
                      <tr key={p.id}>
                        <td style={{padding: '8px', borderBottom: '1px solid #f1f5f9'}}>{p.name}</td>
                        <td style={{padding: '8px', borderBottom: '1px solid #f1f5f9'}}>{p.phone || '-'}</td>
                        <td style={{padding: '8px', borderBottom: '1px solid #f1f5f9'}}>{p.last_visit ? new Date(p.last_visit).toLocaleDateString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No patients found.</p>
              )}
            </div>
            <div className="note-actions">
              <button className="pdf-btn" onClick={()=>setShowPatientsModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showQuickActions && (
        <div className="dropdown-menu">
          <button onClick={() => { setTranscription(''); setAiNote(null); setShowQuickActions(false); }}>
            🆕 New Dictation
          </button>
          <button onClick={copyNoteToClipboard}>📋 Copy selected</button>
          <button onClick={downloadNoteTxt}>💾 Save selected (.txt)</button>
          <button onClick={selectAllSections}>✅ Select all sections</button>
          <button onClick={clearAllSections}>🧹 Clear selections</button>
          <button onClick={() => window.print()}>🖨️ Print Note</button>
          <button onClick={() => alert('Stats feature coming soon!')}>📊 View Statistics</button>
          <button onClick={() => setShowQuickActions(false)}>❌ Close</button>
        </div>
      )}

      {showSaveDropdown && (
        <div className="dropdown-menu" style={{position: 'fixed', top: '380px', right: '48px', zIndex: 100}}>
          <button onClick={() => selectSaveOption('ai')} disabled={!aiNote}>
            🤖 AI Note Only {aiNote ? '' : '(Generate first)'}
          </button>
          <button onClick={() => selectSaveOption('raw')} disabled={!transcription}>
            📝 Raw Transcript Only {transcription ? '' : '(No transcript)'}
          </button>
          <button onClick={() => selectSaveOption('both')} disabled={!aiNote || !transcription}>
            📋 Both AI & Raw {aiNote && transcription ? '' : '(Need both)'}
          </button>
          <button onClick={() => setShowSaveDropdown(false)}>❌ Close</button>
        </div>
      )}

      <div className="action-bar">
        <button onClick={() => setShowSettings(!showSettings)} className="action-btn purple">⚙️ Settings</button>
        <button onClick={() => setShowQuickActions(!showQuickActions)} className="action-btn orange">⚡ Quick Actions</button>
        <button onClick={() => document.querySelector('.encounters-table')?.scrollIntoView({ behavior: 'smooth' })} className="action-btn green">📋 Encounters</button>
      </div>

      <div className="stats-grid">
        <div className="stat-card purple">
          <div className="stat-icon"><CalendarIcon /></div>
          <div className="stat-info">
            <div className="stat-label">Today's Encounters</div>
            <div className="stat-value">{stats.todayEncounters}</div>
            <div className="stat-sub">+1.2% from yesterday</div>
          </div>
        </div>

        <div className="stat-card green" onClick={openPatientsList} style={{cursor: 'pointer'}}>
          <div className="stat-icon"><UsersIcon /></div>
          <div className="stat-info">
            <div className="stat-label">Active Patients</div>
            <div className="stat-value">{stats.activePatients}</div>
            <div className="stat-sub">Total registered</div>
          </div>
        </div>

        <div className="stat-card pink">
          <div className="stat-icon"><SparklesIcon /></div>
          <div className="stat-info">
            <div className="stat-label">AI Notes Generated</div>
            <div className="stat-value">{stats.aiNotesGenerated}</div>
            <div className="stat-sub">Avg 90% accuracy</div>
          </div>
        </div>

        <div className="stat-card orange">
          <div className="stat-icon"><TimerIcon /></div>
          <div className="stat-info">
            <div className="stat-label">Time Saved</div>
            <div className="stat-value">{stats.timeSaved}h</div>
            <div className="stat-sub">Since last note</div>
          </div>
        </div>
      </div>

      <div className="main-panels">
        <div className="panel live-panel">
          <div className="panel-header">
            <span className="panel-icon red"><MicIcon /></span>
            <div>
              <h3>Live Dictation</h3>
              <p>Powered by AI transcription</p>
            </div>
          </div>

          <div className="record-controls">
            <button
              className={`record-btn ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
              title={isRecording ? 'Stop recording' : 'Start recording'}
            >
              <span className="record-icon">{isRecording ? '⏹' : '🔴'}</span>
              <span className="record-label">{isRecording ? 'Stop' : 'Record'}</span>
            </button>
            <div className="source-selector">
              <label htmlFor="micSource">Source:</label>
              <select id="micSource" value={micSource} onChange={(e) => setMicSource(e.target.value)}>
                <option value="computer">Computer Microphone</option>
                <option value="mobile">Mobile Mic (QR Code)</option>
              </select>
            </div>
            {micSource === 'mobile' && mobileConnected && (
              <span className="mobile-status connected">Mobile connected</span>
            )}
          </div>

          <textarea
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
            onClick={() => {
              if (transcription) {
                navigator.clipboard.writeText(transcription).then(() => {
                  pushToast('Transcript copied to clipboard', 'success')
                }).catch(() => {})
              }
            }}
            placeholder="Start recording to see real-time transcription...

Your words will appear here as you speak

(Click to copy)"
            className="transcription-area"
            rows="8"
            style={{cursor: transcription ? 'pointer' : 'default'}}
          />

          <div className="upload-section">
            <label className="upload-label">
              Or Upload Audio File
              <input type="file" accept="audio/*" style={{ display: 'none' }} />
            </label>
            <span className="no-file">No file chosen</span>
          </div>
        </div>

        <div className="panel note-panel">
          <div className="panel-header">
            <span className="panel-icon green"><FileTextIcon /></span>
            <div>
              <h3>AI-Generated Note</h3>
              <div className="note-sub">
                <span className="subtle">{(user?.domain === 'dental' ? 'Dental format' : 'Medical format')}</span>
                <select
                  className="template-select"
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  title="Choose a medical template to guide AI generation"
                >
                  {TEMPLATES.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <button onClick={handleGenerate} disabled={!transcription || isGenerating} className="generate-btn">
              {isGenerating ? '⏳ Generating...' : '✨ Generate'}
            </button>
            <button className="pdf-btn" onClick={copyNoteToClipboard} disabled={!aiNote}>📋 Copy</button>
            <button className="pdf-btn" onClick={() => window.print()} disabled={!aiNote}>📄 PDF</button>
            <button className="save-note-btn" onClick={openSaveDropdown} disabled={!aiNote && !transcription}>💾 Save ▼</button>
          </div>

          {aiNote ? (
            <div className="soap-note">
              {aiNote.chiefComplaint ? (
                <>
                  {/* Patient Info Header */}
                  <div className="patient-info-header" style={{
                    background: '#f0f7ff',
                    border: '1px solid #dbeafe',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    marginBottom: '16px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px 16px'
                  }}>
                    <div><strong>Patient:</strong> {aiNote.patient}</div>
                    <div><strong>Date:</strong> {aiNote.date}</div>
                    <div><strong>Dentist:</strong> {aiNote.dentist}</div>
                    <div><strong>Visit Type:</strong> {aiNote.visitType}</div>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('chiefComplaint') ? 'selected-for-copy' : ''}`} style={{borderLeft: '4px solid #34d399', background: '#f0fdf4'}}>
                    <div className="section-head" onClick={() => toggleSection('chiefComplaint')} role="button" style={{cursor: 'pointer'}}>
                      <strong>🦷 Chief Complaint</strong>
                      <label><input type="checkbox" checked={isSelected('chiefComplaint')} onChange={() => toggleSection('chiefComplaint')} /><span>Copy me</span></label>
                    </div>
                    <p style={{whiteSpace: 'pre-wrap', margin: '8px 0', lineHeight: '1.6'}}>{aiNote.chiefComplaint}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('historyOfPresentIllness') ? 'selected-for-copy' : ''}`} style={{borderLeft: '4px solid #fb7185', background: '#fff1f2'}}>
                    <div className="section-head" onClick={() => toggleSection('historyOfPresentIllness')} role="button" style={{cursor: 'pointer'}}>
                      <strong>📋 History of Present Illness</strong>
                      <label><input type="checkbox" checked={isSelected('historyOfPresentIllness')} onChange={() => toggleSection('historyOfPresentIllness')} /><span>Copy me</span></label>
                    </div>
                    <p style={{whiteSpace: 'pre-wrap', margin: '8px 0', lineHeight: '1.6'}}>{aiNote.historyOfPresentIllness}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('medicalHistory') ? 'selected-for-copy' : ''}`} style={{borderLeft: '4px solid #60a5fa', background: '#eff6ff'}}>
                    <div className="section-head" onClick={() => toggleSection('medicalHistory')} role="button" style={{cursor: 'pointer'}}>
                      <strong>⚕️ Medical History</strong>
                      <label><input type="checkbox" checked={isSelected('medicalHistory')} onChange={() => toggleSection('medicalHistory')} /><span>Copy me</span></label>
                    </div>
                    <p style={{whiteSpace: 'pre-wrap', margin: '8px 0', lineHeight: '1.6'}}>{aiNote.medicalHistory}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('dentalHistory') ? 'selected-for-copy' : ''}`} style={{borderLeft: '4px solid #8b5cf6', background: '#faf5ff'}}>
                    <div className="section-head" onClick={() => toggleSection('dentalHistory')} role="button" style={{cursor: 'pointer'}}>
                      <strong>🪥 Dental History</strong>
                      <label><input type="checkbox" checked={isSelected('dentalHistory')} onChange={() => toggleSection('dentalHistory')} /><span>Copy me</span></label>
                    </div>
                    <p style={{whiteSpace: 'pre-wrap', margin: '8px 0', lineHeight: '1.6'}}>{aiNote.dentalHistory}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('intraOralExamination') ? 'selected-for-copy' : ''}`} style={{borderLeft: '4px solid #f59e0b', background: '#fffbeb'}}>
                    <div className="section-head" onClick={() => toggleSection('intraOralExamination')} role="button" style={{cursor: 'pointer'}}>
                      <strong>👁️ Intraoral Examination</strong>
                      <label><input type="checkbox" checked={isSelected('intraOralExamination')} onChange={() => toggleSection('intraOralExamination')} /><span>Copy me</span></label>
                    </div>
                    <p style={{whiteSpace: 'pre-wrap', margin: '8px 0', lineHeight: '1.6'}}>{aiNote.intraOralExamination}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('diagnosticProcedures') ? 'selected-for-copy' : ''}`} style={{borderLeft: '4px solid #06b6d4', background: '#ecfeff'}}>
                    <div className="section-head" onClick={() => toggleSection('diagnosticProcedures')} role="button" style={{cursor: 'pointer'}}>
                      <strong>🔬 Diagnostic Procedures</strong>
                      <label><input type="checkbox" checked={isSelected('diagnosticProcedures')} onChange={() => toggleSection('diagnosticProcedures')} /><span>Copy me</span></label>
                    </div>
                    <p style={{whiteSpace: 'pre-wrap', margin: '8px 0', lineHeight: '1.6'}}>{aiNote.diagnosticProcedures}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('assessment') ? 'selected-for-copy' : ''}`} style={{borderLeft: '4px solid #ef4444', background: '#fef2f2'}}>
                    <div className="section-head" onClick={() => toggleSection('assessment')} role="button" style={{cursor: 'pointer'}}>
                      <strong>📊 Assessment</strong>
                      <label><input type="checkbox" checked={isSelected('assessment')} onChange={() => toggleSection('assessment')} /><span>Copy me</span></label>
                    </div>
                    <p style={{whiteSpace: 'pre-wrap', margin: '8px 0', lineHeight: '1.6'}}>{aiNote.assessment}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('educationRecommendations') ? 'selected-for-copy' : ''}`} style={{borderLeft: '4px solid #84cc16', background: '#f7fee7'}}>
                    <div className="section-head" onClick={() => toggleSection('educationRecommendations')} role="button" style={{cursor: 'pointer'}}>
                      <strong>📚 Education & Recommendations</strong>
                      <label><input type="checkbox" checked={isSelected('educationRecommendations')} onChange={() => toggleSection('educationRecommendations')} /><span>Copy me</span></label>
                    </div>
                    <p style={{whiteSpace: 'pre-wrap', margin: '8px 0', lineHeight: '1.6'}}>{aiNote.educationRecommendations}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('patientResponse') ? 'selected-for-copy' : ''}`} style={{borderLeft: '4px solid #14b8a6', background: '#f0fdfa'}}>
                    <div className="section-head" onClick={() => toggleSection('patientResponse')} role="button" style={{cursor: 'pointer'}}>
                      <strong>💬 Patient Response</strong>
                      <label><input type="checkbox" checked={isSelected('patientResponse')} onChange={() => toggleSection('patientResponse')} /><span>Copy me</span></label>
                    </div>
                    <p style={{whiteSpace: 'pre-wrap', margin: '8px 0', lineHeight: '1.6'}}>{aiNote.patientResponse}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('plan') ? 'selected-for-copy' : ''}`} style={{borderLeft: '4px solid #6366f1', background: '#eef2ff'}}>
                    <div className="section-head" onClick={() => toggleSection('plan')} role="button" style={{cursor: 'pointer'}}>
                      <strong>📋 Plan</strong>
                      <label><input type="checkbox" checked={isSelected('plan')} onChange={() => toggleSection('plan')} /><span>Copy me</span></label>
                    </div>
                    <p style={{whiteSpace: 'pre-wrap', margin: '8px 0', lineHeight: '1.6'}}>{aiNote.plan}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className={`soap-section ${selectedSections.size>0 && isSelected('subjective') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('subjective')} role="button">
                    <div className="section-head">
                      <strong>📝 Subjective</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('subjective')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.subjective}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('objective') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('objective')} role="button">
                    <div className="section-head">
                      <strong>🔬 Objective</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('objective')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.objective}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('assessment') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('assessment')} role="button">
                    <div className="section-head">
                      <strong>🩺 Assessment</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('assessment')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.assessment}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('plan') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('plan')} role="button">
                    <div className="section-head">
                      <strong>📋 Plan</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('plan')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.plan}</p>
                  </div>
                </>
              )}


              <div className="note-actions">
                <button
                  className="save-note-btn"
                  onClick={async () => {
                    if (!aiNote) return
                    try {
                      if (aiNote.sessionId) {
                        await fetch(`/api/sessions/${aiNote.sessionId}`, {
                          method: 'PUT',
                          headers: authHeaders(),
                          body: JSON.stringify({ ai_notes: JSON.stringify(aiNote), status: 'finalized' })
                        })
                        alert('Note saved!')
                      } else {
                        downloadNoteTxt()
                      }
                    } catch (err) {
                      console.error(err)
                      alert('Failed to save note')
                    }
                  }}
                >
                  💾 Save Note
                </button>
                <button className="pdf-btn" onClick={copyNoteToClipboard}>📋 Copy Text</button>
                <button className="pdf-btn" onClick={() => window.print()}>
                  📄 PDF
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-note">
              <div className="empty-icon">📝</div>
              <p>No note generated yet</p>
              <small>Click "Generate" to create an AI-powered SOAP note</small>
            </div>
          )}
        </div>
      </div>

      <div className="encounters-table">
        <div className="table-header">
          <span className="table-icon">📋</span>
          <h3>Recent Encounters</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>PATIENT</th>
              <th>TOOTH/AREA</th>
              <th>DATE</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {recentEncounters.map(enc => (
              <tr key={enc.id} style={{cursor: 'pointer'}} onClick={() => setViewingEncounter(enc)}>
                <td>{enc.patient_name || 'Unknown'}</td>
                <td>{enc.tooth_number || '-'}</td>
                <td>{new Date(enc.created_at).toLocaleDateString()}</td>
                <td><span className={`status ${enc.status}`}>{enc.status}</span></td>
                <td><button className="view-btn" onClick={(e) => { e.stopPropagation(); setViewingEncounter(enc); }}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewingEncounter && (
        <div className="modal-overlay" onClick={() => setViewingEncounter(null)}>
          <div className="modal-content copy-modal" onClick={(e) => e.stopPropagation()} style={{maxWidth: '800px', maxHeight: '80vh', overflow: 'auto'}}>
            <h2>📝 Encounter Details</h2>
            <div className="settings-section">
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', padding: '12px', background: '#f8fafc', borderRadius: '8px'}}>
                <div><strong>Patient:</strong> {viewingEncounter.patient_name || 'Unknown'}</div>
                <div><strong>Tooth/Area:</strong> {viewingEncounter.tooth_number || '-'}</div>
                <div><strong>Date:</strong> {new Date(viewingEncounter.created_at).toLocaleString()}</div>
                <div><strong>Status:</strong> <span className={`status ${viewingEncounter.status}`}>{viewingEncounter.status}</span></div>
              </div>
              
              {viewingEncounter.ai_notes && (
                <div style={{marginTop: '16px'}}>
                  <strong>AI Note:</strong>
                  <div style={{marginTop: '8px', padding: '12px', background: '#f0fdf4', borderRadius: '8px', borderLeft: '4px solid #10b981', maxHeight: '300px', overflow: 'auto'}}>
                    <pre style={{whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '14px', margin: 0}}>{typeof viewingEncounter.ai_notes === 'string' ? viewingEncounter.ai_notes : JSON.stringify(viewingEncounter.ai_notes, null, 2)}</pre>
                  </div>
                </div>
              )}
              
              {viewingEncounter.transcript && (
                <div style={{marginTop: '16px'}}>
                  <strong>Raw Transcript:</strong>
                  <div style={{marginTop: '8px', padding: '12px', background: '#fef3c7', borderRadius: '8px', borderLeft: '4px solid #f59e0b', maxHeight: '200px', overflow: 'auto'}}>
                    <pre style={{whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '14px', margin: 0}}>{viewingEncounter.transcript}</pre>
                  </div>
                </div>
              )}
            </div>
            <div className="note-actions">
              <button className="pdf-btn" onClick={() => window.print()}>🖨️ Print</button>
              <button className="save-note-btn" onClick={() => {
                try {
                  const aiNoteText = viewingEncounter.ai_notes 
                    ? (typeof viewingEncounter.ai_notes === 'string' 
                      ? viewingEncounter.ai_notes 
                      : JSON.stringify(viewingEncounter.ai_notes, null, 2))
                    : ''
                  const transcriptText = viewingEncounter.transcript || ''
                  const text = `Patient: ${viewingEncounter.patient_name || 'Unknown'}
Tooth/Area: ${viewingEncounter.tooth_number || '-'}
Date: ${new Date(viewingEncounter.created_at).toLocaleString()}
Status: ${viewingEncounter.status || 'unknown'}

${aiNoteText ? 'AI NOTE:\n' + aiNoteText + '\n\n' : ''}${transcriptText ? 'RAW TRANSCRIPT:\n' + transcriptText : ''}`
                  
                  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  const safeName = (viewingEncounter.patient_name || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_')
                  const dateStr = new Date(viewingEncounter.created_at).toISOString().slice(0,10)
                  a.download = `Encounter_${safeName}_${dateStr}.txt`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                  pushToast('Download started', 'success')
                } catch (err) {
                  console.error('Download failed:', err)
                  pushToast('Download failed', 'error')
                }
              }}>💾 Download</button>
              <button className="pdf-btn" onClick={()=>setViewingEncounter(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal for Mobile Mic */}
      {showQrModal && (
        <div className="modal-overlay" onClick={closeQrModal}>
          <div className="modal-content qr-modal" onClick={(e) => e.stopPropagation()}>
            <h2>📱 Scan with Your Phone</h2>
            <p className="qr-instructions">
              Select <strong>Mobile Mic (QR Code)</strong> and scan this QR code with your phone to use it as a wireless microphone.
            </p>
            <div className="qr-box">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Mobile Mic QR Code" className="qr-image" />
              ) : (
                <p>Generating QR code...</p>
              )}
            </div>
            <div className="qr-status">
              {mobileConnected ? (
                <span className="status-connected">Mobile connected — speak into your phone</span>
              ) : (
                <span className="status-waiting">Waiting for phone to connect...</span>
              )}
            </div>
            <div className="qr-url-box">
              <code className="qr-url">{`${window.location.origin}/mobile-mic?session=${relaySessionId}`}</code>
            </div>
            <div className="note-actions">
              <button className="save-note-btn" onClick={closeQrModal}>
                {mobileConnected ? 'Done (Keep Connected)' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  )
}

export default MainDashboard
