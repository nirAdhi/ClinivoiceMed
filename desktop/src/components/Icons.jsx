import React from 'react'

const strokeProps = { stroke: 'currentColor', strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }

export const CalendarIcon = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" {...props}>
    <rect x="3" y="4" width="18" height="18" rx="2" {...strokeProps} />
    <path d="M16 2v4M8 2v4M3 10h18" {...strokeProps} />
  </svg>
)

export const UsersIcon = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" {...props}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...strokeProps} />
    <circle cx="9" cy="7" r="4" {...strokeProps} />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" {...strokeProps} />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" {...strokeProps} />
  </svg>
)

export const SparklesIcon = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" {...props}>
    <path d="M12 3l2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4z" {...strokeProps} />
  </svg>
)

export const TimerIcon = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" {...props}>
    <circle cx="12" cy="13" r="8" {...strokeProps} />
    <path d="M12 9v4l3 2" {...strokeProps} />
    <path d="M10 2h8" {...strokeProps} />
  </svg>
)

export const MicIcon = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" {...props}>
    <rect x="9" y="2" width="6" height="11" rx="3" {...strokeProps} />
    <path d="M5 10a7 7 0 0 0 14 0" {...strokeProps} />
    <path d="M12 19v3" {...strokeProps} />
  </svg>
)

export const FileTextIcon = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" {...strokeProps} />
    <path d="M14 2v6h6" {...strokeProps} />
    <path d="M16 13H8M16 17H8M10 9H8" {...strokeProps} />
  </svg>
)

export const ClipboardIcon = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" {...props}>
    <rect x="8" y="2" width="8" height="4" rx="1" {...strokeProps} />
    <rect x="4" y="6" width="16" height="14" rx="2" {...strokeProps} />
  </svg>
)

export const SaveIcon = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" {...props}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" {...strokeProps} />
    <path d="M17 21v-8H7v8" {...strokeProps} />
    <path d="M7 3v5h8" {...strokeProps} />
  </svg>
)

export const FileDownIcon = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" {...strokeProps} />
    <path d="M14 2v6h6" {...strokeProps} />
    <path d="M12 12v6" {...strokeProps} />
    <path d="M9 15l3 3 3-3" {...strokeProps} />
  </svg>
)

export const SettingsIcon = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" {...props}>
    <circle cx="12" cy="12" r="3" {...strokeProps} />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" {...strokeProps} />
  </svg>
)

export default {
  CalendarIcon,
  UsersIcon,
  SparklesIcon,
  TimerIcon,
  MicIcon,
  FileTextIcon,
  ClipboardIcon,
  SaveIcon,
  FileDownIcon,
  SettingsIcon,
}
