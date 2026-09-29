export function formatAddress(address: string, short: boolean = true): string {
  if (!short) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatHash(hash: string, short: boolean = true): string {
  if (!short) return hash
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`
}

export function formatMST(amount: number, decimals: number = 4): string {
  return amount.toFixed(decimals)
}

export function formatTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''} ago`
  } else if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
  } else if (hours < 24) {
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  } else {
    return `${days} day${days !== 1 ? 's' : ''} ago`
  }
}

export function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}
