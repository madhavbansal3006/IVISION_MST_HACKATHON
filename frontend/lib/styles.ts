import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const statusBadgeVariants = cva(
  'inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium',
  {
    variants: {
      status: {
        ONLINE: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        OFFLINE: 'bg-slate-50 text-slate-700 border border-slate-200',
        WORKING: 'bg-blue-50 text-blue-700 border border-blue-200',
        OPEN: 'bg-amber-50 text-amber-700 border border-amber-200',
        COMPLETED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        REFUNDED: 'bg-slate-100 text-slate-700 border border-slate-200',
        FAILED: 'bg-red-50 text-red-700 border border-red-200',
        VERIFIED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        PENDING: 'bg-blue-50 text-blue-700 border border-blue-200',
      },
    },
    defaultVariants: {
      status: 'PENDING',
    },
  }
)

export const stepVariants = cva(
  'flex items-center justify-between relative',
  {
    variants: {
      active: {
        true: 'text-cyan-600',
        false: 'text-slate-400',
      },
    },
  }
)
