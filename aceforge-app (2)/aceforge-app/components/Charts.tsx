'use client'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export function AttendanceTrend({ data }: { data: { day: string; punctual: number; late: number }[] }) {
  if (!data.length) return <p className="text-slate-600">No sessions in this period.</p>
  return (
    <div role="img" aria-label="Verified attendance per day, on time and late" style={{ width: '100%', height: 230 }}>
      <ResponsiveContainer>
        <BarChart data={data.map((d) => ({ ...d, day: d.day.slice(5) }))}>
          <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" fontSize={12} /><YAxis allowDecimals={false} fontSize={12} width={28} /><Tooltip /><Legend />
          <Bar dataKey="punctual" name="On time" stackId="a" fill="#0b1f4b" /><Bar dataKey="late" name="Late" stackId="a" fill="#f59e0b" />
        </BarChart>
      </ResponsiveContainer>
    </div>)
}
export function PointsChart({ data }: { data: { source: string; points: number }[] }) {
  if (!data.length) return <p className="text-slate-600">No points earned in this period.</p>
  return (
    <div role="img" aria-label="Points earned by activity" style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="source" fontSize={12} /><YAxis fontSize={12} width={36} /><Tooltip />
          <Bar dataKey="points" name="Points" fill="#f59e0b" /></BarChart>
      </ResponsiveContainer>
    </div>)
}
