'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Copy, Cpu, Droplets, ExternalLink, Loader2, Menu, MoreHorizontal, Radio, RefreshCw, ShieldCheck, Wallet, X, Zap } from 'lucide-react'
import { mockActivities, mockMachines, NETWORK_CONFIG, WALLET_BALANCE, getMachine, registerRealJob } from '@/lib/mock-data'
import { useJob, useJobs, cacheJobTransaction, type JobDetails } from '@/lib/jobs'
import { MST_CHAIN_ID, MACHINE_MANDI_CONTRACT_ADDRESS } from '@/lib/config'
import { useWallet, WalletProvider } from '@/lib/useWallet'
import { executeCreateJob, executeRefundJob, isRateLimitError, type CreatedJobResult } from '@/lib/web3'
import { cn } from '@/lib/utils'

const short = (value: string, start = 6, end = 4) => `${value.slice(0, start)}...${value.slice(-end)}`
const money = (value: number) => `${value.toFixed(4)} MST`

/**
 * DEMO-ONLY presentation fallback for pending demo jobs.
 * This is strictly a UI preview; it is NEVER written to blockchain or job state.
 * Priority: REAL VERIFIED PROOF DATA > SIMULATED DEMO PREVIEW
 */
const DEMO_PREVIEW_TELEMETRY = {
  preReading: 100,
  postReading: 160,
  delta: 60,
} as const

function Logo() {
  return (
    <button onClick={() => (location.href = '/')} className="flex items-center gap-3 text-left group">
      <img
        src="/brand-logo.png"
        alt="MachineMandi Shield Logo"
        width={36}
        height={36}
        className="size-9 object-contain drop-shadow-sm transition-transform duration-200 group-hover:scale-105"
      />
      <span>
        <span className="block text-[15px] font-bold tracking-tight text-slate-950">MachineMandi</span>
        <span className="block text-[10px] font-medium tracking-[.16em] text-slate-500">MACHINE ECONOMY</span>
      </span>
    </button>
  )
}

function NetworkBadge() {
  const {
    account,
    chainId,
    isCorrectNetwork,
    balance,
    isConnecting,
    isMounted,
    error,
    connect,
    switchNetwork,
    clearError,
  } = useWallet()

  if (!isMounted || !account) {
    return (
      <div className="relative">
        <button
          onClick={connect}
          disabled={isConnecting}
          className="flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
        >
          {isConnecting ? (
            <Loader2 size={14} className="animate-spin text-cyan-400" />
          ) : (
            <Wallet size={14} />
          )}
          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
        {error && (
          <div className="absolute right-0 top-full mt-2 z-50 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 shadow-lg text-left text-xs text-rose-800 min-w-[220px] max-w-[320px]">
            <span className="shrink-0 font-bold text-rose-600">!</span>
            <div className="flex-1">
              <p className="font-semibold">Wallet connection failed</p>
              <p className="mt-0.5 text-[11px] text-rose-700 leading-tight">{error}</p>
            </div>
            <button
              onClick={clearError}
              className="text-rose-400 hover:text-rose-700 p-0.5"
              aria-label="Dismiss error"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>
    )
  }

  if (!isCorrectNetwork) {
    return (
      <div className="relative">
        <button
          onClick={switchNetwork}
          className="flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3.5 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100"
        >
          <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
          Switch to MST Testnet
        </button>
        {error && (
          <div className="absolute right-0 top-full mt-2 z-50 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 shadow-lg text-left text-xs text-rose-800 min-w-[220px] max-w-[320px]">
            <span className="shrink-0 font-bold text-rose-600">!</span>
            <div className="flex-1">
              <p className="font-semibold">Network switch failed</p>
              <p className="mt-0.5 text-[11px] text-rose-700 leading-tight">{error}</p>
            </div>
            <button
              onClick={clearError}
              className="text-rose-400 hover:text-rose-700 p-0.5"
              aria-label="Dismiss error"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
      <span className="size-2 rounded-full bg-emerald-500" />
      MST TESTNET
      <span className="mx-1 text-slate-300">|</span>
      <span className="font-mono text-slate-900">{short(account, 6, 4)}</span>
      {balance !== null && (
        <>
          <span className="mx-1 text-slate-300">|</span>
          <span className="font-mono text-emerald-700">{Number(balance).toFixed(4)} MST</span>
        </>
      )}
    </div>
  )
}

function Status({ value }: { value: string }) {
  const norm = (value || '').toUpperCase()
  const isGreen = norm === 'ONLINE' || norm === 'COMPLETED' || norm === 'VERIFIED'
  const isCyan = norm === 'WORKING' || norm === 'PROCESSING' || norm === 'SUBMITTING'
  const isAmber = norm === 'OPEN' || norm === 'PENDING' || norm === 'WAITING' || norm === 'RECEIVED'
  const isPurple = norm === 'REFUNDED'
  const isRose = norm === 'FAILED' || norm === 'ERROR'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider',
        isGreen
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : isCyan
          ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
          : isAmber
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : isPurple
          ? 'border-purple-200 bg-purple-50 text-purple-700'
          : isRose
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-slate-200 bg-slate-50 text-slate-600'
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {value}
    </span>
  )
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      aria-label="Copy value"
      onClick={() => {
        navigator.clipboard?.writeText(value)
        setDone(true)
        setTimeout(() => setDone(false), 1200)
      }}
      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const path = usePathname()
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-500 md:flex">
            {[
              ['/', 'Dashboard'],
              ['/machines/1', 'Machines'],
              ['/jobs', 'Jobs'],
              ['/activity', 'Activity'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className={cn('transition-colors hover:text-slate-950', path === href && 'text-slate-950')}
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="hidden md:block">
            <NetworkBadge />
          </div>
          <button className="md:hidden" aria-label="Open navigation" onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <nav className="flex flex-col gap-4 border-t border-slate-100 bg-white px-5 py-5 text-sm md:hidden">
            {[
              ['/', 'Dashboard'],
              ['/machines/1', 'Machines'],
              ['/jobs', 'Jobs'],
              ['/activity', 'Activity'],
            ].map(([href, label]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
            <div className="pt-2">
              <NetworkBadge />
            </div>
          </nav>
        )}
      </header>
      {children}
    </div>
  )
}

function PageFrame({
  eyebrow,
  title,
  subtitle,
  children,
  actions,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <main className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-14">
      <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          {eyebrow && <p className="mb-3 text-xs font-bold tracking-[.18em] text-cyan-600">{eyebrow}</p>}
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">{title}</h1>
          {subtitle && <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </main>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]', className)}>
      {children}
    </section>
  )
}

function Process({ active = 0 }: { active?: number }) {
  const steps = ['PAY', 'WORK', 'PROVE', 'VERIFY', 'SETTLE']
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-bold tracking-[.14em] text-slate-400">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center gap-2">
          <span
            className={cn(
              'grid size-7 place-items-center rounded-full border text-[10px]',
              i <= active ? 'border-cyan-200 bg-cyan-50 text-cyan-700' : 'border-slate-200 bg-white'
            )}
          >
            {i < active ? <Check size={13} /> : i + 1}
          </span>
          <span className={i === active ? 'text-cyan-700' : ''}>{step}</span>
          {i < steps.length - 1 && <ArrowRight size={14} className="mx-1 text-slate-300" />}
        </div>
      ))}
    </div>
  )
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </Card>
  )
}

function MachineCard({ machine, onCreate }: { machine: typeof mockMachines[number]; onCreate: () => void }) {
  return (
    <Card className="p-6 transition-shadow hover:shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
            <Droplets size={21} />
          </span>
          <div>
            <h3 className="font-bold text-slate-950">{machine.name}</h3>
            <p className="mt-1 text-xs text-slate-500">{machine.service}</p>
          </div>
        </div>
        <Status value={machine.status} />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-5 border-t border-slate-100 pt-5 text-sm">
        <div>
          <p className="text-xs text-slate-400">Price</p>
          <p className="mt-1 font-semibold">{money(machine.price)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Minimum delta</p>
          <p className="mt-1 font-semibold">{machine.minimumDelta}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Device</p>
          <p className="mt-1 font-semibold">{machine.device}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Signer</p>
          <p className="mt-1 font-mono text-xs">{short(machine.signer)}</p>
        </div>
      </div>
      <button
        onClick={onCreate}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Create Job <ArrowRight size={15} />
      </button>
    </Card>
  )
}

function ActivityList({ jobs = [] }: { jobs?: JobDetails[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const activities = useMemo(() => {
    if (jobs.length > 0) {
      const items: { id: string; title: string; description: string; detail: string; status: string; time: string }[] = []
      for (const j of jobs.slice(0, 6)) {
        if (j.status === 'COMPLETED') {
          items.push({
            id: `settled-${j.id}`,
            title: `Job #${j.id} Settled & Paid`,
            description: `${j.machineName} · ${j.service}`,
            detail: j.amountFormatted,
            status: 'COMPLETED',
            time: 'Recently',
          })
          items.push({
            id: `proof-${j.id}`,
            title: `Job #${j.id} Work Proof Verified`,
            description: j.delta !== null ? `Delta +${j.delta} verified on-chain` : 'Verified on-chain',
            detail: 'Verified',
            status: 'VERIFIED',
            time: 'Recently',
          })
        } else {
          items.push({
            id: `job-${j.id}`,
            title: `Job #${j.id} Created`,
            description: `${j.machineName} · Escrow funded`,
            detail: j.amountFormatted,
            status: j.status,
            time: 'Active',
          })
        }
      }
      return items.slice(0, 6)
    }

    return mockActivities.map((item, index) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      detail: item.metadata?.amount || item.metadata?.status || '',
      status: item.metadata?.status || 'ONLINE',
      time: mounted ? `${index === 0 ? 8 : 10} min ago` : '10 min ago',
    }))
  }, [jobs, mounted])

  return (
    <div className="divide-y divide-slate-100">
      {activities.map((item) => (
        <div key={item.id} className="flex items-center gap-4 px-5 py-4">
          <span className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-500">
            <Zap size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800">{item.title}</p>
            <p className="mt-1 text-xs text-slate-500">{item.description}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-700">{item.detail}</p>
            <p className="mt-1 text-xs text-slate-400">{item.time}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function Dashboard() {
  const router = useRouter()
  const { jobs } = useJobs()

  const openJobsCount = jobs.filter((j) => j.status === 'PENDING' || j.status === 'PROCESSING').length
  const completedJobsCount = jobs.filter((j) => j.status === 'COMPLETED').length
  const totalSettled = jobs
    .filter((j) => j.status === 'COMPLETED')
    .reduce((sum, j) => sum + j.amount, 0)

  return (
    <PageFrame
      eyebrow="MACHINE-TO-MACHINE ECONOMY"
      title="Machines that get paid for work they can prove."
      subtitle="Connect physical machines to programmable MST payments with verifiable work proofs."
      actions={
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/jobs/create')}
            className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Create Job
          </button>
          <button
            onClick={() => router.push('/jobs')}
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            View Live Jobs <ArrowRight className="ml-1 inline" size={15} />
          </button>
        </div>
      }
    >
      <Card className="mb-8 p-5">
        <Process />
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Active Machines" value={String(mockMachines.length)} detail="Connected and available" />
        <Metric label="Open Jobs" value={String(openJobsCount)} detail="Currently in progress" />
        <Metric label="Completed Jobs" value={String(completedJobsCount)} detail="Settled on-chain" />
        <Metric label="MST Settled" value={totalSettled.toFixed(4)} detail="Across all machines" />
      </div>
      <div className="mt-12 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Live Machine Network</h2>
          <p className="mt-2 text-sm text-slate-500">Connected machines available for paid work.</p>
        </div>
        <a href="/machines/1" className="hidden text-sm font-semibold text-cyan-700 md:block">
          View machine details <ArrowRight className="ml-1 inline" size={14} />
        </a>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {mockMachines.map((machine) => (
          <MachineCard key={machine.id} machine={machine} onCreate={() => router.push('/jobs/create')} />
        ))}
      </div>
      <div className="mt-12 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Recent Activity</h2>
          <p className="mt-2 text-sm text-slate-500">A live record of machine work and settlement events.</p>
        </div>
        <a href="/activity" className="text-sm font-semibold text-cyan-700">
          View all <ArrowRight className="ml-1 inline" size={14} />
        </a>
      </div>
      <Card className="mt-5 overflow-hidden">
        <ActivityList jobs={jobs} />
      </Card>
    </PageFrame>
  )
}

function CreateJob() {
  const router = useRouter()
  const wallet = useWallet()
  const [selected, setSelected] = useState(1)
  const [state, setState] = useState<'idle' | 'confirming' | 'broadcasting' | 'done'>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [createdJob, setCreatedJob] = useState<CreatedJobResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const machine = mockMachines.find((m) => m.id === selected) || mockMachines[0]

  const handleFundAndCreate = async () => {
    setErrorMsg(null)

    // 1. Ensure wallet is connected
    if (!wallet.account) {
      try {
        await wallet.connect()
      } catch (err: any) {
        setErrorMsg('Please connect your browser wallet to create a job.')
      }
      return
    }

    // 2. Ensure network is MST Testnet
    if (!wallet.isCorrectNetwork) {
      try {
        await wallet.switchNetwork()
      } catch (err: any) {
        setErrorMsg('Please switch to MST Testnet (Chain ID 91562037).')
        return
      }
    }

    // 3. Balance pre-check if available
    if (wallet.balance !== null && Number(wallet.balance) < machine.price) {
      setErrorMsg(`Insufficient MST balance. You have ${wallet.balance} MST, but need ${machine.price} MST.`)
      return
    }

    try {
      setState('confirming')

      const result = await executeCreateJob(selected, machine.price, {
        onBroadcast: (hash) => {
          setTxHash(hash)
          setState('broadcasting')
        },
      })

      setCreatedJob(result)
      setTxHash(result.transactionHash)
      setState('done')

      // Register the real job into the application cache
      registerRealJob({
        id: result.jobId,
        machineId: result.nodeId,
        machineName: machine.name,
        status: 'OPEN',
        amount: Number(result.amount),
        service: machine.service,
        transaction: result.transactionHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      // Refresh buyer balance after escrow deposit
      wallet.refreshBalance()
    } catch (err: any) {
      console.error('[CreateJob] Failed:', err)
      setState('idle')
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        setErrorMsg('Transaction rejected in wallet.')
      } else if (isRateLimitError(err)) {
        setErrorMsg('MST Testnet RPC is temporarily rate-limited. Please wait a moment and retry.')
      } else {
        setErrorMsg(err.reason || err.message || 'Transaction failed. Please try again.')
      }
    }
  }

  return (
    <PageFrame
      eyebrow="SMART-CONTRACT ESCROW"
      title="Create Machine Job"
      subtitle="Select a machine and fund the job through MST smart-contract escrow."
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <Card className="p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Select a machine</h2>
              <p className="mt-1 text-sm text-slate-500">Choose a registered node for this job.</p>
            </div>
            <RadioDot size={18} className="text-cyan-600" />
          </div>
          {mockMachines.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelected(m.id)}
              disabled={state === 'confirming' || state === 'broadcasting'}
              className={cn(
                'mb-3 flex w-full items-center justify-between rounded-xl border p-5 text-left transition',
                selected === m.id
                  ? 'border-cyan-400 bg-cyan-50/50 ring-2 ring-cyan-100'
                  : 'border-slate-200 hover:border-slate-300'
              )}
            >
              <div>
                <p className="font-bold">{m.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {m.service} · {m.device}
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  Minimum delta: <b>{m.minimumDelta}</b>
                </p>
              </div>
              <div className="text-right">
                <Status value={m.status} />
                <p className="mt-3 text-sm font-bold">{money(m.price)}</p>
              </div>
            </button>
          ))}
        </Card>

        <Card className="h-fit p-6">
          <h2 className="text-lg font-bold">Payment summary</h2>
          <div className="mt-6 space-y-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Escrow amount</span>
              <b>{money(machine.price)}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Buyer wallet</span>
              <b className="font-mono text-xs">
                {wallet.isMounted && wallet.account ? short(wallet.account, 6, 4) : 'Not connected'}
              </b>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Wallet balance</span>
              <b>{wallet.isMounted && wallet.balance !== null ? `${Number(wallet.balance).toFixed(4)} MST` : 'Connect wallet'}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Network</span>
              <b>{wallet.isMounted && wallet.isCorrectNetwork ? NETWORK_CONFIG.name : 'Switch required'}</b>
            </div>
          </div>

          <div className="my-6 border-t border-slate-100" />

          {errorMsg && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
              <p className="font-semibold">Creation Error</p>
              <p className="mt-1">{errorMsg}</p>
              {isRateLimitError(errorMsg) && (
                <button
                  type="button"
                  onClick={handleFundAndCreate}
                  disabled={state === 'confirming' || state === 'broadcasting'}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 font-medium text-white transition hover:bg-rose-800 disabled:opacity-50"
                >
                  <RefreshCw size={13} />
                  Retry Escrow Funding
                </button>
              )}
            </div>
          )}

          <button
            disabled={state === 'confirming' || state === 'broadcasting' || state === 'done'}
            onClick={handleFundAndCreate}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {state === 'confirming' ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Confirm in Wallet...
              </>
            ) : state === 'broadcasting' ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Waiting for Confirmation...
              </>
            ) : state === 'done' ? (
              <>
                <Check size={16} />
                Job created ✓
              </>
            ) : !wallet.isMounted || !wallet.account ? (
              <>
                <Wallet size={16} />
                Connect Wallet to Fund
              </>
            ) : !wallet.isCorrectNetwork ? (
              'Switch to MST Testnet'
            ) : (
              'Fund & Create Job'
            )}
          </button>

          <p className="mt-4 text-xs leading-5 text-slate-500">
            Your payment is held in smart-contract escrow on MST Testnet and released only after a valid machine work proof is verified by the contract.
          </p>

          {state === 'done' && createdJob && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center justify-between">
                <p className="font-bold text-emerald-800">Job #{createdJob.jobId} · OPEN</p>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-800">
                  Block {createdJob.blockNumber}
                </span>
              </div>
              <p className="mt-2 font-mono text-xs text-emerald-700">
                Tx: {short(createdJob.transactionHash, 8, 6)}
              </p>
              <div className="mt-3 flex items-center justify-between pt-2 border-t border-emerald-100">
                <button
                  onClick={() => router.push(`/jobs/${createdJob.jobId}`)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-900 underline hover:no-underline"
                >
                  Open live job #{createdJob.jobId} <ArrowRight className="inline" size={13} />
                </button>
                <a
                  href={`https://testnet.mstscan.com/tx/${createdJob.transactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900"
                >
                  MST Explorer <ExternalLink size={12} />
                </a>
              </div>
            </div>
          )}
        </Card>
      </div>
    </PageFrame>
  )
}

function LiveJob({ jobId = 4 }: { jobId?: number }) {
  const router = useRouter()
  const { job, loading, error, reload } = useJob(jobId)

  if (loading) {
    return (
      <PageFrame
        eyebrow={`JOB #${jobId} · CONNECTING`}
        title="Loading Job from MST Blockchain"
        subtitle="Verifying on-chain state and device proof report..."
      >
        <Card className="flex flex-col items-center justify-center p-14 text-center">
          <Loader2 className="size-9 animate-spin text-cyan-700" />
          <p className="mt-4 text-base font-semibold text-slate-800">Reading Job #{jobId} on-chain state...</p>
          <p className="mt-1 text-xs text-slate-400">Querying MachineMandi contract & backend relayer records</p>
        </Card>
      </PageFrame>
    )
  }

  if (error || !job) {
    return (
      <PageFrame
        eyebrow={`JOB #${jobId} · ERROR`}
        title="Job Not Found"
        subtitle={`Unable to locate Job #${jobId} on the MachineMandi smart contract.`}
      >
        <Card className="border-rose-200 bg-rose-50/50 p-8 text-center">
          <p className="font-semibold text-rose-800">{error || `Job #${jobId} does not exist.`}</p>
          <p className="mt-1 text-xs text-slate-500">Ensure the job ID is valid and confirmed on the MST testnet.</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => reload()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw size={13} /> Retry
            </button>
            <button
              onClick={() => router.push('/jobs')}
              className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              All Jobs
            </button>
          </div>
        </Card>
      </PageFrame>
    )
  }

  const isCompleted = job.status === 'COMPLETED'
  const isProcessing = job.status === 'PROCESSING'
  const isRefunded = job.status === 'REFUNDED'
  const isFailed = job.status === 'FAILED'

  // Priority: REAL VERIFIED PROOF DATA > SIMULATED DEMO PREVIEW
  const hasRealProof = job.preReading !== null && job.postReading !== null
  const displayPreReading = hasRealProof ? job.preReading : DEMO_PREVIEW_TELEMETRY.preReading
  const displayPostReading = hasRealProof ? job.postReading : DEMO_PREVIEW_TELEMETRY.postReading
  const displayDelta = hasRealProof ? (job.delta ?? (job.postReading! - job.preReading!)) : DEMO_PREVIEW_TELEMETRY.delta

  const activeStep = isCompleted ? 4 : isProcessing ? 3 : isRefunded || isFailed ? 0 : 1

  return (
    <PageFrame
      eyebrow={`JOB #${job.id} · ${job.machineName}`}
      title={
        isCompleted
          ? 'Machine work completed & settled on-chain.'
          : isProcessing
          ? 'Device proof received · Relayer submitting settlement.'
          : isRefunded
          ? 'Job has been refunded.'
          : isFailed
          ? 'Job verification failed.'
          : 'Machine is currently performing the requested service.'
      }
      subtitle={
        isCompleted
          ? `${job.service} · Device proof verified and funds released to node.`
          : isProcessing
          ? `${job.service} · EIP-712 proof submitted to smart contract.`
          : `${job.service} · Simulated device work report in progress.`
      }
      actions={<Status value={job.status} />}
    >
      <Card className="p-6">
        <Process active={activeStep} />
      </Card>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <Card className="p-7">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold tracking-[.16em] text-slate-400">MACHINE STATUS</p>
              <h2 className="mt-3 text-2xl font-bold">{job.machineName}</h2>
              <p
                className={cn(
                  'mt-2 flex items-center gap-2 text-sm font-semibold',
                  isCompleted
                    ? 'text-emerald-700'
                    : isProcessing
                    ? 'text-cyan-700'
                    : isRefunded
                    ? 'text-purple-700'
                    : isFailed
                    ? 'text-rose-700'
                    : 'text-emerald-700'
                )}
              >
                <span
                  className={cn(
                    'size-2 rounded-full',
                    isCompleted
                      ? 'bg-emerald-500'
                      : isProcessing
                      ? 'bg-cyan-500 animate-pulse'
                      : isRefunded
                      ? 'bg-purple-500'
                      : isFailed
                      ? 'bg-rose-500'
                      : 'bg-emerald-500 animate-pulse'
                  )}
                />
                {isCompleted
                  ? 'ONLINE · WORK COMPLETED'
                  : isProcessing
                  ? 'ONLINE · SETTLING PROOF'
                  : isRefunded
                  ? 'OFFLINE · REFUNDED'
                  : isFailed
                  ? 'ERROR · FAILED'
                  : 'ONLINE · WORKING'}
              </p>
            </div>
            <span className="grid size-14 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
              <Droplets size={27} />
            </span>
          </div>
          <div className="mt-10 grid grid-cols-3 gap-4 border-t border-slate-100 pt-5">
            <div>
              <p className="text-xs text-slate-400">Duration</p>
              <p className="mt-1 font-mono font-semibold">
                {job.startedAt && job.completedAt
                  ? `${job.completedAt - job.startedAt}s`
                  : isCompleted
                  ? 'Settled'
                  : 'In progress'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Device</p>
              <p className="mt-1 font-semibold">{job.device}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Job</p>
              <p className="mt-1 font-mono font-semibold">#{job.id}</p>
            </div>
          </div>
        </Card>
        <Card className="p-7">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold tracking-[.16em] text-slate-400">SIMULATED DEVICE TELEMETRY</p>
            <span className="rounded-full bg-cyan-50 px-2.5 py-0.5 text-[10px] font-semibold text-cyan-700">
              Demo Device · Simulated Sensor
            </span>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              ['BEFORE', String(displayPreReading)],
              [
                isCompleted ? 'AFTER' : 'CURRENT',
                String(displayPostReading),
              ],
              ['DELTA', displayDelta >= 0 ? `+${displayDelta}` : String(displayDelta)],
            ].map(([a, b]) => (
              <div key={a} className="rounded-xl bg-slate-50 p-4">
                <p className="text-[10px] font-bold tracking-[.12em] text-slate-400">{a}</p>
                <p className="mt-3 text-2xl font-bold">{b}</p>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Proof threshold</span>
              <b>
                {displayDelta} / {job.minimumDelta}
              </b>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.max(0, (displayDelta / job.minimumDelta) * 100))}%`,
                }}
              />
            </div>
          </div>
        </Card>
      </div>
      <Card className="mt-6 p-7">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold tracking-[.16em] text-slate-400">DEVICE PROOF</p>
            <h2 className="mt-3 text-xl font-bold">Demo device work report</h2>
          </div>
          <Status value={isCompleted ? 'VERIFIED' : isProcessing ? 'PROCESSING' : isRefunded ? 'REFUNDED' : 'PENDING'} />
        </div>
        <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-2">
          <div>
            <p className="text-xs text-slate-400">Device signer</p>
            <p className="mt-2 font-mono text-xs text-slate-800">{short(job.signer)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Signature</p>
            <p className="mt-2 font-mono text-xs text-slate-600 truncate">
              {job.signature
                ? short(job.signature, 14, 10)
                : isCompleted
                ? 'On-chain verified'
                : 'Waiting for signed proof...'}
            </p>
          </div>
        </div>
        <div className="mt-7 flex flex-wrap gap-3">
          {isCompleted ? (
            <>
              <button
                onClick={() => router.push(`/jobs/${job.id}/proof`)}
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                View Verified Proof <ArrowRight className="ml-1 inline" size={14} />
              </button>
              <button
                onClick={() => router.push(`/jobs/${job.id}/settlement`)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                View Settlement <ArrowRight className="ml-1 inline" size={14} />
              </button>
            </>
          ) : (
            <button
              onClick={() => router.push(`/jobs/${job.id}/proof`)}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Inspect Proof Status <ArrowRight className="ml-1 inline" size={14} />
            </button>
          )}
        </div>
      </Card>
    </PageFrame>
  )
}

function Proof({ jobId = 4 }: { jobId?: number }) {
  const router = useRouter()
  const { job, loading, error, reload } = useJob(jobId)

  if (loading) {
    return (
      <PageFrame
        eyebrow={`JOB #${jobId} · ON-CHAIN VERIFICATION`}
        title="Loading Verification Data"
        subtitle="Connecting to MST blockchain..."
      >
        <Card className="flex flex-col items-center justify-center p-14 text-center">
          <Loader2 className="size-9 animate-spin text-cyan-700" />
          <p className="mt-4 text-base font-semibold text-slate-800">Loading proof for Job #{jobId}...</p>
        </Card>
      </PageFrame>
    )
  }

  if (error || !job) {
    return (
      <PageFrame
        eyebrow={`JOB #${jobId} · ERROR`}
        title="Job Not Found"
        subtitle={`Unable to locate Job #${jobId}.`}
      >
        <Card className="border-rose-200 bg-rose-50/50 p-8 text-center">
          <p className="font-semibold text-rose-800">{error || `Job #${jobId} not found.`}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => reload()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Retry
            </button>
            <button
              onClick={() => router.push('/jobs')}
              className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              All Jobs
            </button>
          </div>
        </Card>
      </PageFrame>
    )
  }

  const isCompleted = job.status === 'COMPLETED'
  const isProofReceived = job.proofReceived || isCompleted
  const hasRealProof = job.preReading !== null && job.postReading !== null
  const displayPreReading = hasRealProof ? job.preReading : DEMO_PREVIEW_TELEMETRY.preReading
  const displayPostReading = hasRealProof ? job.postReading : DEMO_PREVIEW_TELEMETRY.postReading
  const displayDelta = hasRealProof ? (job.delta ?? (job.postReading! - job.preReading!)) : DEMO_PREVIEW_TELEMETRY.delta

  return (
    <PageFrame
      eyebrow={`JOB #${job.id} · ON-CHAIN VERIFICATION`}
      title={isCompleted ? 'Work Proof Verified' : 'Work Proof Verification'}
      subtitle={
        isCompleted
          ? 'Demo device work report verified against the MachineMandi job.'
          : 'Simulated device proof status for demo machine node.'
      }
      actions={<Status value={job.status} />}
    >
      <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
        <Card className="p-6">
          <h2 className="text-lg font-bold">Verification checklist</h2>
          <div className="mt-5 space-y-1">
            {[
              ['Device source', 'Demo Device · Simulated Sensor'],
              ['Device report', isProofReceived ? 'Received (Simulated)' : 'Pending submission'],
              ['EIP-712 signature', isCompleted ? 'Valid & Verified' : isProofReceived ? 'Received' : 'Waiting for device'],
              ['Registered signer', `Node #${job.nodeId} (${short(job.signer)})`],
              ['Service hash', `Matches job (${short(job.serviceHash)})`],
              [
                'Sensor delta',
                hasRealProof
                  ? `${displayDelta} ≥ ${job.minimumDelta}${displayDelta >= job.minimumDelta ? ' ✓' : ' ✕'}`
                  : `Preview: ${displayDelta} ≥ ${job.minimumDelta} (Awaiting Proof)`,
              ],
              [
                'Timestamp',
                job.deadline > 0
                  ? `Within deadline (${new Date(job.deadline * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
                  : 'Valid',
              ],
            ].map(([a, b]) => (
              <div key={a} className="flex items-center justify-between border-b border-slate-100 py-4 text-sm">
                <span className="text-slate-600">{a}</span>
                <span className={cn('flex items-center gap-2 font-semibold', isCompleted ? 'text-emerald-700' : 'text-slate-700')}>
                  {isCompleted && <Check size={16} />}
                  {b}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold tracking-[.16em] text-slate-400">
                {isCompleted ? 'VERIFIED TELEMETRY' : hasRealProof ? 'SIMULATED TELEMETRY' : 'SIMULATED PREVIEW TELEMETRY'}
              </p>
              <span className="rounded-full bg-cyan-50 px-2.5 py-0.5 text-[10px] font-semibold text-cyan-700">
                Demo Device · Simulated Sensor
              </span>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-4">
              {[
                ['PRE READING', String(displayPreReading)],
                ['POST READING', String(displayPostReading)],
                ['DELTA', displayDelta >= 0 ? `+${displayDelta}` : String(displayDelta)],
              ].map(([a, b]) => (
                <div key={a}>
                  <p className="text-xs text-slate-400">{a}</p>
                  <p className="mt-2 text-3xl font-bold">{b}</p>
                </div>
              ))}
            </div>
          </Card>
          <details className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]" open={isCompleted}>
            <summary className="flex cursor-pointer list-none items-center justify-between font-bold">
              EIP-712 technical details <ChevronDown className="transition group-open:rotate-180" size={18} />
            </summary>
            <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5">
              {Object.entries({
                Domain: 'MachineMandi',
                Version: '1',
                'Chain ID': String(MST_CHAIN_ID),
                'Verifying Contract': MACHINE_MANDI_CONTRACT_ADDRESS,
                'Primary Type': 'WorkProof',
                Signature: job.signature || (isCompleted ? 'On-chain verified' : 'Awaiting device submission'),
              }).map(([a, b]) => (
                <div key={a} className="flex items-start justify-between gap-4 text-sm">
                  <span className="text-slate-500">{a}</span>
                  <span className="flex items-center gap-1 text-right font-mono text-xs text-slate-700">
                    {typeof b === 'string' && b.length > 18 ? short(b, 10, 8) : b}
                    {typeof b === 'string' && b.startsWith('0x') && <CopyButton value={String(b)} />}
                  </span>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
      <div className="mt-7 flex flex-wrap gap-3">
        {isCompleted ? (
          <button
            onClick={() => router.push(`/jobs/${job.id}/settlement`)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            View settlement <ArrowRight size={15} />
          </button>
        ) : (
          <button
            onClick={() => router.push(`/jobs/${job.id}`)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft size={15} /> Back to Live Job
          </button>
        )}
      </div>
    </PageFrame>
  )
}

function Settlement({ jobId = 4 }: { jobId?: number }) {
  const router = useRouter()
  const wallet = useWallet()
  const { job, loading, error, reload } = useJob(jobId)

  const [refundState, setRefundState] = useState<'idle' | 'confirming' | 'broadcasting' | 'done'>('idle')
  const [refundTxHash, setRefundTxHash] = useState<string | null>(null)
  const [refundError, setRefundError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState<number>(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  if (loading) {
    return (
      <PageFrame
        eyebrow={`JOB #${jobId} · SETTLEMENT`}
        title="Loading settlement state..."
        subtitle="Connecting to MST blockchain..."
      >
        <Card className="flex flex-col items-center justify-center p-14 text-center">
          <Loader2 className="size-9 animate-spin text-cyan-700" />
          <p className="mt-4 text-base font-semibold text-slate-800">Checking settlement for Job #{jobId}...</p>
        </Card>
      </PageFrame>
    )
  }

  if (error || !job) {
    return (
      <PageFrame
        eyebrow={`JOB #${jobId} · ERROR`}
        title="Unable to load settlement state."
        subtitle={`Failed to retrieve settlement records for Job #${jobId}.`}
      >
        <Card className="border-rose-200 bg-rose-50/50 p-8 text-center">
          <p className="font-semibold text-rose-800">{error || `Unable to load settlement state for Job #${jobId}.`}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => reload()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Retry
            </button>
            <button
              onClick={() => router.push('/jobs')}
              className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              All Jobs
            </button>
          </div>
        </Card>
      </PageFrame>
    )
  }

  const isCompleted = job.status === 'COMPLETED'
  const isRefunded = job.status === 'REFUNDED'
  const isPending = !isCompleted && !isRefunded
  const txDisplay = job.settlementTxHash || ''

  const isDeadlinePassed = job.deadline > 0 && currentTime > job.deadline
  const deadlineFormatted = job.deadline > 0 ? new Date(job.deadline * 1000).toUTCString() : 'None'

  const handleRefund = async () => {
    setRefundError(null)

    if (!wallet.account) {
      try {
        await wallet.connect()
      } catch {
        setRefundError('Please connect your BridgeKey wallet to refund.')
        return
      }
    }

    if (!wallet.isCorrectNetwork) {
      try {
        await wallet.switchNetwork()
      } catch {
        setRefundError('Switch to MST Testnet.')
        return
      }
    }

    try {
      setRefundState('confirming')

      const result = await executeRefundJob(job.id, {
        onBroadcast: (hash) => {
          setRefundTxHash(hash)
          setRefundState('broadcasting')
        },
      })

      setRefundTxHash(result.transactionHash)
      setRefundState('done')

      cacheJobTransaction(job.id, result.transactionHash)
      await reload()
      wallet.refreshBalance()
    } catch (err: any) {
      console.error('[Refund] Failed:', err)
      setRefundState('idle')

      if (err.code === 4001 || err.code === 'ACTION_REJECTED' || err.message?.includes('rejected')) {
        setRefundError('Transaction rejected in wallet.')
      } else if (isRateLimitError(err)) {
        setRefundError('MST Testnet RPC is temporarily rate-limited. Please wait and try again.')
      } else if (err.message?.includes('already completed')) {
        setRefundError('Job is already completed; escrow has been released.')
      } else if (err.message?.includes('already been refunded') || err.message?.includes('already refunded')) {
        setRefundError('Escrow has already been refunded.')
      } else if (err.message?.includes('Switch to MST Testnet')) {
        setRefundError('Switch to MST Testnet.')
      } else if (err.message?.includes('not available yet') || err.message?.includes('deadline')) {
        setRefundError('Refund is not available yet.')
      } else {
        setRefundError(err.reason || err.message || 'Refund transaction failed. The job may no longer be refundable.')
      }

      reload().catch(() => {})
    }
  }

  // Visual process rail states: PAY → WORK → PROVE → VERIFY → SETTLE → MACHINE PAID (or REFUND)
  const processSteps = isRefunded
    ? [
        { name: 'PAY', detail: 'Escrow funded', status: 'done' },
        { name: 'WORK', detail: 'Deadline expired', status: 'done' },
        { name: 'PROVE', detail: 'No proof received', status: 'done' },
        { name: 'REFUND', detail: 'Smart contract', status: 'done' },
        { name: 'BUYER REFUNDED', detail: 'Returned to buyer', status: 'done' },
      ]
    : [
        { name: 'PAY', detail: 'Escrow funded', status: 'done' },
        { name: 'WORK', detail: isCompleted ? 'Machine executed' : isPending ? 'In progress' : 'Expired', status: isCompleted ? 'done' : isPending ? 'active' : 'idle' },
        { name: 'PROVE', detail: isCompleted ? 'Report signed' : isPending ? 'Awaiting report' : 'None', status: isCompleted ? 'done' : isPending ? 'active' : 'idle' },
        { name: 'VERIFY', detail: isCompleted ? 'EIP-712 verified' : 'Pending', status: isCompleted ? 'done' : 'idle' },
        { name: 'SETTLE', detail: isCompleted ? 'Smart contract' : 'Pending', status: isCompleted ? 'done' : 'idle' },
        { name: 'MACHINE PAID', detail: isCompleted ? 'Released' : 'Pending', status: isCompleted ? 'done' : 'idle' },
      ]

  return (
    <PageFrame
      eyebrow={`JOB #${job.id} · ${isCompleted ? 'SETTLEMENT COMPLETED' : isRefunded ? 'ESCROW REFUNDED' : 'SETTLEMENT PENDING'}`}
      title={isCompleted ? 'Machine Work Settled' : isRefunded ? 'Job Escrow Refunded' : 'Settlement Awaiting Proof'}
      subtitle={
        isCompleted
          ? 'Escrow released and machine paid.'
          : isRefunded
          ? 'Escrow refunded back to buyer wallet.'
          : 'Waiting for verified work proof.'
      }
      actions={<Status value={job.status} />}
    >
      {/* Visual Settlement Flow: PAY → WORK → PROVE → VERIFY → SETTLE → MACHINE PAID */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold tracking-[.18em] text-slate-400 uppercase">SETTLEMENT FLOW</p>
            <p className="text-sm font-semibold text-slate-800">Machine Payment Pipeline</p>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {isCompleted ? 'Flow completed · Payment released' : isRefunded ? 'Job refunded' : 'Flow in progress'}
          </span>
        </div>
        <div className={cn('mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3', isRefunded ? 'lg:grid-cols-5' : 'lg:grid-cols-6')}>
          {processSteps.map((step, idx) => {
            const isDone = step.status === 'done'
            const isActive = step.status === 'active'
            return (
              <div
                key={step.name}
                className={cn(
                  'relative flex flex-col justify-between rounded-xl border p-3 transition',
                  isDone
                    ? 'border-emerald-200 bg-emerald-50/40 text-emerald-950'
                    : isActive
                    ? 'border-cyan-300 bg-cyan-50/50 text-cyan-950 ring-1 ring-cyan-200'
                    : 'border-slate-100 bg-slate-50/50 text-slate-400'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-slate-400">0{idx + 1}</span>
                  {isDone ? (
                    <span className="flex size-4 items-center justify-center rounded-full bg-emerald-600 text-white">
                      <Check size={10} strokeWidth={3} />
                    </span>
                  ) : isActive ? (
                    <span className="size-2 rounded-full bg-cyan-500 animate-ping" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-slate-300" />
                  )}
                </div>
                <div className="mt-3">
                  <p className="text-xs font-bold tracking-tight">{step.name}</p>
                  <p className="mt-0.5 text-[11px] leading-tight opacity-75">{step.detail}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Primary Settlement Summary Card */}
      <Card className={cn('p-7', isCompleted ? 'border-emerald-200' : isRefunded ? 'border-rose-200' : 'border-slate-200')}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'grid size-11 place-items-center rounded-full',
                  isCompleted ? 'bg-emerald-100 text-emerald-700' : isRefunded ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                )}
              >
                {isCompleted ? <Check size={22} strokeWidth={2.5} /> : isRefunded ? <X size={22} /> : <Radio size={20} className="animate-pulse" />}
              </span>
              <div>
                <p className="text-[11px] font-bold tracking-[.18em] text-slate-400 uppercase">SETTLEMENT</p>
                <h2 className="text-2xl font-bold tracking-tight text-slate-950">
                  {isCompleted ? `Job #${job.id} COMPLETED` : isRefunded ? `Job #${job.id} REFUNDED` : `Job #${job.id} OPEN`}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {job.machineName} · Node #{job.nodeId} · {job.service}
                </p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <Status value={job.status} />
            <p className="mt-1 font-mono text-sm font-bold text-slate-900">{job.amountFormatted}</p>
          </div>
        </div>

        {/* 3 Prominent Verified Badges for Completed Job */}
        {isCompleted && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-5 py-3.5 text-xs font-semibold text-emerald-900">
            <div className="flex items-center gap-2">
              <Check className="size-4 text-emerald-600" />
              <span>WORK PROOF VERIFIED</span>
            </div>
            <div className="hidden h-3 w-px bg-emerald-200 sm:block" />
            <div className="flex items-center gap-2">
              <Check className="size-4 text-emerald-600" />
              <span>ESCROW RELEASED</span>
            </div>
            <div className="hidden h-3 w-px bg-emerald-200 sm:block" />
            <div className="flex items-center gap-2">
              <Check className="size-4 text-emerald-600" />
              <span>MACHINE PAID</span>
            </div>
          </div>
        )}

        {isPending && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
            <p className="font-semibold">Escrow FUNDED · Waiting for Verified Work Proof</p>
            <p className="mt-1 text-amber-700">
              The escrow deposit of {job.amountFormatted} is securely locked in the MachineMandi smart contract.
              Payout to the machine is pending device proof submission and on-chain verification.
            </p>
          </div>
        )}

        {isRefunded && (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-900">
            <p className="font-semibold">Escrow REFUNDED</p>
            <p className="mt-1 text-rose-700">
              This job expired without a valid proof submitted before the deadline. The escrow amount of {job.amountFormatted} has been refunded to the buyer.
            </p>
          </div>
        )}

        {/* Required Settlement Attributes Grid */}
        <div className="mt-8 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Escrow status</p>
            <div className="mt-2 flex items-center gap-2">
              {isCompleted ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  <Check size={12} strokeWidth={3} /> RELEASED
                </span>
              ) : isRefunded ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                  REFUNDED
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                  FUNDED
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {isCompleted ? 'Released to machine payout address' : isRefunded ? 'Returned to buyer wallet' : 'Locked in escrow contract'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Escrow amount</p>
            <p className="mt-2 font-mono text-base font-bold text-slate-950">{job.amountFormatted}</p>
            <p className="mt-1.5 text-xs text-slate-500">Real on-chain job value</p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Work proof</p>
            <p className="mt-2 text-sm font-semibold">
              {isCompleted ? (
                <span className="flex items-center gap-1 text-emerald-700">
                  <Check size={14} strokeWidth={3} /> Verified
                </span>
              ) : isRefunded ? (
                <span className="text-slate-500">Expired without proof</span>
              ) : (
                <span className="text-amber-700">Waiting for device proof</span>
              )}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">
              {isCompleted ? 'Cryptographic EIP-712 match' : isPending ? 'Pending relayer submission' : 'Not completed'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sensor result</p>
            <p className="mt-2 font-mono text-sm font-bold text-slate-900">
              {isCompleted ? (
                `${job.preReading ?? 0} → ${job.postReading ?? '—'}`
              ) : isRefunded ? (
                'Not submitted'
              ) : (
                <span className="font-sans text-xs font-normal text-slate-500">Waiting for device proof</span>
              )}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">
              {isCompleted ? 'Verified on-chain readings' : 'Awaiting physical sensor telemetry'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Verified delta</p>
            <p className="mt-2 font-mono text-sm font-bold">
              {isCompleted ? (
                <span className="text-emerald-700">{job.delta !== null ? (job.delta >= 0 ? `+${job.delta}` : String(job.delta)) : 'Verified'}</span>
              ) : (
                <span className="font-sans text-xs font-normal text-slate-500">Pending</span>
              )}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">
              Required delta: <b className="font-mono font-semibold text-slate-700">≥ {job.minimumDelta}</b>
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Machine</p>
            <p className="mt-2 text-sm font-bold text-slate-900">{job.machineName}</p>
            <p className="mt-1.5 text-xs text-slate-500">Node ID: #{job.nodeId} · {job.service}</p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 lg:col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Payout address</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-slate-800">
                {job.payout ? (
                  <>
                    <span className="hidden sm:inline">{job.payout}</span>
                    <span className="sm:hidden">{short(job.payout, 10, 8)}</span>
                  </>
                ) : (
                  'Registered Node Payout'
                )}
              </span>
              {job.payout && <CopyButton value={job.payout} />}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">Registered recipient wallet address</p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Payout amount</p>
            <p className="mt-2 font-mono text-base font-bold text-slate-950">
              {isCompleted ? (
                <span className="text-emerald-700">{job.amountFormatted}</span>
              ) : isRefunded ? (
                <span className="text-slate-500">0.0000 MST</span>
              ) : (
                <span className="font-sans text-xs font-normal text-amber-700">Pending verification</span>
              )}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">
              {isCompleted ? 'Disbursed to machine' : isRefunded ? 'Refunded to buyer' : 'Pending work verification'}
            </p>
          </div>

          {isRefunded && (
            <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4 lg:col-span-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-500">Amount returned</p>
              <p className="mt-2 font-mono text-base font-bold text-rose-950">{job.amountFormatted}</p>
              <p className="mt-1 text-xs text-slate-600">Refund recipient: <span className="font-mono font-medium">{job.buyer}</span></p>
            </div>
          )}
        </div>
      </Card>

      {/* Real Refund Status Section */}
      {isRefunded || refundState === 'done' ? (
        /* State 4: After successful confirmation */
        <Card className="mt-6 border-emerald-200 bg-white p-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold tracking-[.18em] text-slate-400 uppercase">REFUND STATUS</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">REFUNDED ✓</h2>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
              <Check size={14} strokeWidth={3} /> Escrow Refunded
            </span>
          </div>

          <p className="mt-4 text-sm font-medium text-slate-800">
            <span className="font-mono font-bold text-emerald-700">{job.amountFormatted}</span> returned to buyer.
          </p>

          <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-2">
            <div>
              <p className="text-xs text-slate-400">Refund destination</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-xs font-medium text-slate-800">
                  <span className="hidden sm:inline">{job.buyer}</span>
                  <span className="sm:hidden">{short(job.buyer, 10, 8)}</span>
                </span>
                <CopyButton value={job.buyer} />
              </div>
              <p className="mt-0.5 text-xs text-slate-500">Buyer wallet address</p>
            </div>

            <div>
              <p className="text-xs text-slate-400">Refund transaction</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-xs font-medium text-slate-800">
                  {refundTxHash || txDisplay ? (
                    <>
                      <span className="hidden sm:inline">{refundTxHash || txDisplay}</span>
                      <span className="sm:hidden">{short(refundTxHash || txDisplay, 10, 8)}</span>
                    </>
                  ) : (
                    'Confirmed on-chain'
                  )}
                </span>
                {(refundTxHash || txDisplay) && <CopyButton value={refundTxHash || txDisplay!} />}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">MST Testnet execution hash</p>
            </div>
          </div>

          {(refundTxHash || txDisplay) && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <a
                href={`https://testnet.mstscan.com/tx/${refundTxHash || txDisplay}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                View on MSTScan <ExternalLink size={14} />
              </a>
            </div>
          )}
        </Card>
      ) : refundState === 'confirming' || refundState === 'broadcasting' ? (
        /* State 3: While transaction is pending */
        <Card className="mt-6 border-cyan-300 bg-cyan-50/40 p-7">
          <div className="flex items-center gap-3">
            <Loader2 className="size-6 animate-spin text-cyan-700" />
            <div>
              <p className="text-[11px] font-bold tracking-[.18em] text-cyan-800 uppercase">REFUNDING ESCROW...</p>
              <h2 className="mt-0.5 text-lg font-bold text-slate-950">
                {refundState === 'confirming' ? 'Waiting for BridgeKey confirmation...' : 'Broadcasting transaction to MST Testnet...'}
              </h2>
            </div>
          </div>

          <p className="mt-4 text-xs font-medium text-slate-700">
            Waiting for BridgeKey confirmation and MST Testnet transaction. Do not close the page.
          </p>

          {refundTxHash && (
            <div className="mt-4 rounded-lg bg-white/80 p-3 font-mono text-xs text-slate-800">
              <span className="text-slate-500">Transaction broadcast: </span>
              {short(refundTxHash, 14, 10)}
            </div>
          )}
        </Card>
      ) : isCompleted ? (
        /* State 5: COMPLETED job */
        <Card className="mt-6 p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold tracking-[.18em] text-slate-400 uppercase">REFUND STATUS</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Refund Unavailable</h2>
              <p className="mt-1 text-xs text-slate-500">
                Work completed and escrow released.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
              Work completed
            </span>
          </div>
        </Card>
      ) : isDeadlinePassed ? (
        /* State 2: Expired OPEN job - Refundable */
        <Card className="mt-6 border-amber-300 bg-amber-50/30 p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold tracking-[.18em] text-amber-700 uppercase">REFUND STATUS</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Refundable Escrow</h2>
              <p className="mt-1 text-xs text-amber-900">
                No valid work proof received.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-300">
              <Check size={14} strokeWidth={3} /> Refundable: ✓
            </span>
          </div>

          <div className="mt-6 grid gap-4 border-t border-amber-200/60 pt-5 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">Escrow</p>
              <p className="mt-1 font-mono text-sm font-bold text-slate-900">{job.amountFormatted}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Deadline passed</p>
              <p className="mt-1 font-mono text-xs font-semibold text-slate-900">{deadlineFormatted}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Refund destination</p>
              <div className="mt-1 flex items-center gap-1">
                <span className="font-mono text-xs font-semibold text-slate-900">{short(job.buyer, 8, 6)}</span>
                <CopyButton value={job.buyer} />
              </div>
            </div>
          </div>

          {refundError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
              <p className="font-semibold">Refund Error</p>
              <p className="mt-1">{refundError}</p>
            </div>
          )}

          <div className="mt-6 border-t border-amber-200/60 pt-5">
            <button
              onClick={handleRefund}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-amber-700 disabled:opacity-50"
            >
              Refund Escrow
            </button>
          </div>
        </Card>
      ) : (
        /* State 1: OPEN job before deadline */
        <Card className="mt-6 p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold tracking-[.18em] text-slate-400 uppercase">REFUND STATUS</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Refund Unavailable</h2>
              <p className="mt-1 text-xs text-slate-500">
                Reason: Refund becomes available after the job deadline.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              Unavailable
            </span>
          </div>

          <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-400">Escrow</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">FUNDED</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Refund</p>
              <p className="mt-1 text-sm font-medium text-slate-600">Unavailable</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Deadline</p>
              <p className="mt-1 font-mono text-xs font-semibold text-slate-800">{deadlineFormatted}</p>
            </div>
          </div>

          {refundError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
              <p className="font-semibold">Refund Error</p>
              <p className="mt-1">{refundError}</p>
            </div>
          )}

          <div className="mt-6 border-t border-slate-100 pt-5">
            <button
              disabled
              className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 py-2.5 text-xs font-medium text-slate-400"
            >
              Refund unavailable
            </button>
          </div>
        </Card>
      )}

      {/* Settlement Transaction Details Card */}
      <Card className="mt-6 p-7">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold tracking-[.18em] text-slate-400 uppercase">SETTLEMENT TRANSACTION</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">
              {isCompleted ? 'On-Chain Settlement Confirmed' : isRefunded ? 'On-Chain Refund Confirmed' : 'Blockchain Settlement Details'}
            </h2>
          </div>
          {(isCompleted || isRefunded) && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
              <Check size={14} /> Confirmed on-chain
            </span>
          )}
        </div>

        <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-3">
          <div>
            <p className="text-xs text-slate-400">Network</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">MST TESTNET</p>
            <p className="mt-0.5 text-xs text-slate-500">Chain ID: {MST_CHAIN_ID}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs text-slate-400">Settlement transaction</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-medium text-slate-800">
                {txDisplay ? (
                  <>
                    <span className="hidden sm:inline">{txDisplay}</span>
                    <span className="sm:hidden">{short(txDisplay, 12, 10)}</span>
                  </>
                ) : isCompleted ? (
                  <span className="text-slate-600 font-sans">Settlement transaction pending</span>
                ) : isRefunded ? (
                  <span className="text-slate-600 font-sans">Refund recorded on-chain</span>
                ) : (
                  <span className="text-slate-500 font-sans">Waiting for completion</span>
                )}
              </span>
              {txDisplay && <CopyButton value={txDisplay} />}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {txDisplay
                ? 'Cryptographic submitProof / JobCompleted / JobRefunded transaction'
                : isCompleted
                ? 'Settlement confirmed; retrieving event transaction hash from node...'
                : 'Transaction broadcast occurs automatically upon relayer proof submission or refund.'}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-5">
          {txDisplay ? (
            <a
              href={`https://testnet.mstscan.com/tx/${txDisplay}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              View on MSTScan <ExternalLink size={14} />
            </a>
          ) : (isCompleted || isRefunded) ? (
            <a
              href={`https://testnet.mstscan.com/address/${MACHINE_MANDI_CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              View Contract on MSTScan <ExternalLink size={14} />
            </a>
          ) : null}

          <a
            href={`https://testnet.mstscan.com/address/${MACHINE_MANDI_CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            Contract: {short(MACHINE_MANDI_CONTRACT_ADDRESS, 8, 6)} <ExternalLink size={12} />
          </a>
        </div>
      </Card>

      {/* Bottom Actions */}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-950 p-6 text-white">
        <div>
          <p className="text-xs font-bold tracking-[.18em] text-cyan-400 uppercase">
            {isCompleted ? 'MACHINE SETTLEMENT CONFIRMED' : isRefunded ? 'ESCROW REFUNDED' : 'ESCROW ACTIVE'}
          </p>
          <p className="mt-1 text-sm text-slate-300">
            {isCompleted
              ? `Job #${job.id} work completed and ${job.amountFormatted} payout transferred to machine.`
              : isRefunded
              ? `Job #${job.id} escrow was refunded to the buyer.`
              : `Job #${job.id} is active. Run Demo Device Simulator to submit verified work proof.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {isPending && (
            <button
              onClick={() => router.push(`/jobs/${job.id}`)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Back to Job
            </button>
          )}
          {isPending && (
            <button
              onClick={() => router.push(`/jobs/${job.id}/proof`)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Inspect Proof
            </button>
          )}
          <button
            onClick={() => router.push('/jobs')}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            All Jobs
          </button>
          <a
            href="/jobs/create"
            className="rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-slate-100"
          >
            Create Another Job
          </a>
        </div>
      </div>
    </PageFrame>
  )
}

function Jobs() {
  const [filter, setFilter] = useState('All')
  const { jobs, loading, error, reload } = useJobs()

  const rows =
    filter === 'All'
      ? jobs
      : jobs.filter((j) =>
          filter === 'Active'
            ? j.status === 'PENDING' || j.status === 'PROCESSING'
            : filter.toUpperCase() === j.status
        )

  return (
    <PageFrame
      title="Job History"
      subtitle="Track machine jobs and settlement activity on the MST blockchain."
      actions={
        <a
          href="/jobs/create"
          className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Create Job
        </a>
      }
    >
      <div className="mb-5 flex gap-2 overflow-x-auto">
        {['All', 'Active', 'Completed', 'Refunded'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-semibold',
              filter === f ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600'
            )}
          >
            {f}
          </button>
        ))}
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              {['Job', 'Machine', 'Service', 'Amount', 'Status', 'Proof', 'Transaction'].map((h) => (
                <th key={h} className="px-5 py-4 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center">
                  <Loader2 className="mx-auto size-6 animate-spin text-cyan-700" />
                  <p className="mt-2 text-xs font-semibold text-slate-500">Loading on-chain jobs from MST blockchain...</p>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                  <p className="text-sm">No {filter !== 'All' ? filter.toLowerCase() : ''} jobs found on-chain.</p>
                  <a href="/jobs/create" className="mt-3 inline-block text-xs font-semibold text-cyan-700 hover:underline">
                    Create a new job →
                  </a>
                </td>
              </tr>
            ) : (
              rows.map((j) => (
                <tr key={j.id} className="hover:bg-slate-50">
                  <td className="px-5 py-5 font-mono font-semibold">
                    <a href={`/jobs/${j.id}`} className="text-cyan-700 hover:underline">
                      #{j.id}
                    </a>
                  </td>
                  <td className="px-5 py-5 font-semibold">{j.machineName}</td>
                  <td className="px-5 py-5 text-slate-500">{j.service}</td>
                  <td className="px-5 py-5 font-mono text-xs">{j.amountFormatted}</td>
                  <td className="px-5 py-5">
                    <Status value={j.status} />
                  </td>
                  <td className="px-5 py-5">
                    <Status value={j.status === 'COMPLETED' ? 'VERIFIED' : j.proofReceived ? 'RECEIVED' : 'PENDING'} />
                  </td>
                  <td className="px-5 py-5 font-mono text-xs text-slate-500">
                    {j.settlementTxHash ? (
                      <a
                        href={`https://testnet.mstscan.com/tx/${j.settlementTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-700 hover:underline"
                      >
                        {short(j.settlementTxHash)}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </PageFrame>
  )
}

function MachinesPage() {
  const router = useRouter()
  return (
    <PageFrame
      eyebrow="REGISTERED MACHINE NETWORK"
      title="Machines"
      subtitle="Browse connected machines available for verifiable paid work."
    >
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-slate-500">{mockMachines.length} machines connected</p>
        <button
          onClick={() => router.push('/jobs/create')}
          className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Create Job
        </button>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {mockMachines.map((machine) => (
          <MachineCard key={machine.id} machine={machine} onCreate={() => router.push('/jobs/create')} />
        ))}
      </div>
    </PageFrame>
  )
}

function MachineDetail({ machineId = 1 }: { machineId?: number }) {
  const m = getMachine(machineId) || mockMachines[0]
  return (
    <PageFrame
      eyebrow={`REGISTERED MACHINE · NODE #${m.id}`}
      title={m.name}
      subtitle="A registered physical machine available for programmable paid work."
      actions={
        <>
          <Status value={m.status} />
          <a href="/jobs/create" className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
            Create Job
          </a>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <Card className="p-7">
          <div className="grid size-16 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
            <Droplets size={30} />
          </div>
          <h2 className="mt-6 text-2xl font-bold">{m.service}</h2>
          <div className="mt-7 space-y-4">
            {[
              ['Price', money(m.price)],
              ['Minimum delta', String(m.minimumDelta)],
              ['Node ID', String(m.id)],
              ['Device', m.device],
              ['Signer', short(m.signer)],
              ['Service hash', short(m.serviceHash)],
            ].map(([a, b]) => (
              <div key={a} className="flex justify-between gap-4 border-b border-slate-100 pb-3 text-sm">
                <span className="text-slate-500">{a}</span>
                <span className={a === 'Signer' || a === 'Service hash' ? 'font-mono text-xs' : 'font-semibold'}>
                  {b}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-6">
          <Card className="p-7">
            <p className="text-xs font-bold tracking-[.16em] text-slate-400">LIVE TELEMETRY</p>
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-4">
              {[
                ['Current reading', String(m.currentReading)],
                ['Device status', m.status],
                ['Last proof', m.lastProof || 'VERIFIED'],
                ['Jobs completed', String(m.jobsCompleted)],
              ].map(([a, b]) => (
                <div key={a}>
                  <p className="text-xs text-slate-500">{a}</p>
                  <p className="mt-2 text-xl font-bold">{b}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 h-32 rounded-xl bg-slate-50 p-4">
              <div className="flex h-full items-end gap-2">
                {[35, 44, 40, 52, 48, 63, 67].map((v, i) => (
                  <div key={i} className="flex-1 rounded-t bg-cyan-400/70" style={{ height: `${v}%` }} />
                ))}
              </div>
            </div>
          </Card>
          <Card className="p-7">
            <p className="text-sm text-slate-500">Total earned</p>
            <p className="mt-2 text-3xl font-bold">{m.totalEarned.toFixed(4)} MST</p>
          </Card>
        </div>
      </div>
    </PageFrame>
  )
}

function ActivityPage() {
  const { jobs, loading } = useJobs()

  const events = useMemo(() => {
    if (jobs.length > 0) {
      const list: { id: string; title: string; subtitle: string; time: string; isComplete: boolean }[] = []
      for (const j of jobs) {
        if (j.status === 'COMPLETED') {
          list.push({
            id: `settle-${j.id}`,
            title: `Job #${j.id} Settlement Confirmed`,
            subtitle: `${j.amountFormatted} paid to ${short(j.payout || j.signer)}`,
            time: 'Confirmed on-chain',
            isComplete: true,
          })
          list.push({
            id: `proof-${j.id}`,
            title: `Job #${j.id} Work Proof Verified`,
            subtitle: `${j.machineName} · Simulated delta verified: +${j.delta ?? 0}`,
            time: 'Verified',
            isComplete: true,
          })
        }
        list.push({
          id: `create-${j.id}`,
          title: `Job #${j.id} Created`,
          subtitle: `${j.machineName} · ${j.amountFormatted} escrow funded`,
          time: j.createdAt ? j.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Confirmed',
          isComplete: false,
        })
      }
      return list
    }

    return [
      { id: '1', title: 'Irrigation Node #1 Online', subtitle: 'Sensors active', time: 'Active', isComplete: false },
      { id: '2', title: 'Cold Storage Monitor #2 Online', subtitle: 'Sensors active', time: 'Active', isComplete: false },
    ]
  }, [jobs])

  return (
    <PageFrame title="Activity" subtitle="A chronological stream of machine work and settlement events on the MST blockchain.">
      <Card className="divide-y divide-slate-100">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="mx-auto size-6 animate-spin text-cyan-700" />
            <p className="mt-2 text-xs text-slate-500">Loading on-chain activity...</p>
          </div>
        ) : (
          events.map((item) => (
            <div key={item.id} className="flex gap-4 p-5">
              <span
                className={cn(
                  'mt-1 grid size-9 shrink-0 place-items-center rounded-full',
                  item.isComplete ? 'bg-emerald-50 text-emerald-600' : 'bg-cyan-50 text-cyan-700'
                )}
              >
                {item.isComplete ? <Check size={16} /> : <Radio size={16} />}
              </span>
              <div>
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-sm text-slate-500">{item.subtitle}</p>
                <p className="mt-2 text-xs text-slate-400">{item.time}</p>
              </div>
            </div>
          ))
        )}
      </Card>
    </PageFrame>
  )
}

export default function Page() {
  const path = usePathname()

  const proofMatch = path.match(/^\/jobs\/(\d+)\/proof$/)
  const settlementMatch = path.match(/^\/jobs\/(\d+)\/settlement$/)
  const jobMatch = path.match(/^\/jobs\/(\d+)$/)
  const machineMatch = path.match(/^\/machines\/(\d+)$/)

  let content: React.ReactNode = <Dashboard />
  if (path === '/machines') content = <MachinesPage />
  else if (path === '/jobs/create') content = <CreateJob />
  else if (proofMatch) content = <Proof jobId={parseInt(proofMatch[1], 10)} />
  else if (settlementMatch) content = <Settlement jobId={parseInt(settlementMatch[1], 10)} />
  else if (jobMatch) content = <LiveJob jobId={parseInt(jobMatch[1], 10)} />
  else if (path === '/jobs') content = <Jobs />
  else if (machineMatch) content = <MachineDetail machineId={parseInt(machineMatch[1], 10)} />
  else if (path === '/activity') content = <ActivityPage />

  return (
    <WalletProvider>
      <Shell>{content}</Shell>
    </WalletProvider>
  )
}

function RadioDot({ size, className }: { size: number; className?: string }) {
  return (
    <span
      className={cn('inline-block rounded-full border-2 border-current', className)}
      style={{ width: size, height: size }}
    />
  )
}

function AppMeta() {
  return null
}

void AppMeta
void useMemo
void MoreHorizontal
void ShieldCheck
