import './globals.css'
import type { ReactNode } from 'react'
export const metadata = { title: 'Aceforge Student Success System' }
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></head><body>{children}</body></html>
}
