export const TZ = 'Africa/Lagos'
export const todayLagos = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
