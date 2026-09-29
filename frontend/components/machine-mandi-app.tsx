'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  Activity as ActivityIcon,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Copy,
  Droplets,
  ExternalLink,
  FileCheck2,
  Home,
  Loader2,
  Menu,
  Network,
  Play,
  Plus,
  Radio,
  Settings2,
  ShieldCheck,
  RefreshCw,
  Wallet,
  X,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getActivities, getJob, getJobProof, getJobs, getMachine, getMachines, NETWORK_CONFIG, registerRealJob } from '@/lib/mock-data'
import { useWallet } from '@/lib/useWallet'
import { executeCreateJob, isRateLimitError, type CreatedJobResult } from '@/lib/web3'
import { formatAddress, formatElapsed, formatHash, formatMST, formatTime } from '@/lib/format'
import type { Activity as ActivityType, Machine, Job } from '@/types'

const navItems = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/machines/1', label: 'Machines', icon: Network },
  { href: '/jobs', label: 'Jobs', icon: ClipboardCheck },
  { href: '/activity', label: 'Activity', icon: ActivityIcon },
]

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3 group text-left">
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
    </Link>
  )
}

function NetworkBadge() {
  const { account, chainId, isCorrectNetwork, balance, isConnecting, isMounted, error, connect, switchNetwork, clearError } = useWallet()

  if (!isMounted || !account) {
    return (
      <div className="relative">
        <button
          onClick={connect}
          disabled={isConnecting}
          className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          <Wallet className="size-3.5" />
          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
        {error && (
          <div className="absolute right-0 top-full mt-2 z-50 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 shadow-lg text-left text-xs text-rose-800 min-w-[220px]">
            <span className="shrink-0 font-bold text-rose-600">!</span>
            <div className="flex-1">
              <p className="font-semibold">Connection failed</p>
              <p className="mt-0.5 text-[11px] text-rose-700 leading-tight">{error}</p>
            </div>
            <button onClick={clearError} className="text-rose-400 hover:text-rose-700 p-0.5">
              <X className="size-3" />
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
          className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
        >
          <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" /> Switch to MST Testnet
        </button>
        {error && (
          <div className="absolute right-0 top-full mt-2 z-50 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 shadow-lg text-left text-xs text-rose-800 min-w-[220px]">
            <span className="shrink-0 font-bold text-rose-600">!</span>
            <div className="flex-1">
              <p className="font-semibold">Switch failed</p>
              <p className="mt-0.5 text-[11px] text-rose-700 leading-tight">{error}</p>
            </div>
            <button onClick={clearError} className="text-rose-400 hover:text-rose-700 p-0.5">
              <X className="size-3" />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="hidden items-center gap-3 sm:flex">
      <span className="inline-flex items-center gap-2 rounded-md border border-cyan-100 bg-cyan-50 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-700">
        <span className="size-1.5 rounded-full bg-cyan-500" /> MST Testnet
      </span>
      <span className="inline-flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700">
        <span className="size-1.5 rounded-full bg-emerald-500" /> Connected {formatAddress(account)}
        {balance !== null && <span className="ml-1 text-emerald-600 font-mono">({Number(balance).toFixed(4)} MST)</span>}
      </span>
    </div>
  )
}

function Navbar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 lg:px-8">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
              return <Link key={href} href={href} className={cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors', active ? 'bg-slate-100 font-medium text-slate-950' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900')}><Icon className="size-4" />{label}</Link>
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3"><NetworkBadge /><button onClick={() => setMobileOpen(!mobileOpen)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Toggle navigation">{mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}</button></div>
      </div>
      {mobileOpen && <nav className="border-t border-slate-100 bg-white px-5 py-3 md:hidden">{navItems.map(({ href, label, icon: Icon }) => <Link onClick={() => setMobileOpen(false)} key={href} href={href} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm text-slate-600"><Icon className="size-4" />{label}</Link>)}<div className="pt-2"><NetworkBadge /></div></nav>}
    </header>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color = ['ONLINE', 'COMPLETED', 'VERIFIED'].includes(status) ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ['WORKING', 'PENDING'].includes(status) ? 'bg-blue-50 text-blue-700 border-blue-200' : status === 'OPEN' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'
  return <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold tracking-wide', color)}><span className={cn('size-1.5 rounded-full', status === 'ONLINE' || status === 'COMPLETED' || status === 'VERIFIED' ? 'bg-emerald-500' : status === 'WORKING' || status === 'PENDING' ? 'bg-blue-500' : 'bg-amber-500')} />{status}</span>
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div>{eyebrow && <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-600">{eyebrow}</p>}<h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}</div>{action}</div>
}

function SectionTitle({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="text-base font-semibold text-slate-950">{title}</h2>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>{action}</div>
}

function MetricCard({ label, value, detail, icon: Icon, accent }: { label: string; value: string; detail: string; icon: typeof BarChart3; accent?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"><div className="flex items-start justify-between"><p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p><span className={cn('flex size-8 items-center justify-center rounded-lg bg-slate-50 text-slate-400', accent)}><Icon className="size-4" /></span></div><p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div>
}

function ProcessRail({ current = 5 }: { current?: number }) {
  const steps = ['PAY', 'WORK', 'PROVE', 'VERIFY', 'SETTLE']
  return <div className="flex w-full items-center justify-between gap-2 overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-4 sm:px-8">{steps.map((step, i) => <div key={step} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3"><div className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold', i < current ? 'bg-cyan-600 text-white' : i === current ? 'border-2 border-cyan-500 text-cyan-600' : 'border border-slate-200 text-slate-400')}>{i < current ? <Check className="size-3.5" /> : i + 1}</div><span className={cn('text-[10px] font-semibold tracking-wider sm:text-xs', i < current ? 'text-slate-800' : 'text-slate-400')}>{step}</span>{i < steps.length - 1 && <div className={cn('hidden h-px flex-1 sm:block', i < current - 1 ? 'bg-cyan-200' : 'bg-slate-200')} />}</div>)}</div>
}

function MachineCard({ machine, compact = false }: { machine: Machine; compact?: boolean }) {
  return <div className={cn('rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-shadow hover:shadow-md', compact ? 'p-4' : '')}><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600"><Droplets className="size-5" /></span><div><h3 className="text-sm font-semibold text-slate-950">{machine.name}</h3><div className="mt-1 flex items-center gap-2"><StatusBadge status={machine.status} /><span className="text-xs text-slate-400">{machine.service}</span></div></div></div><span className="rounded-md bg-slate-50 px-2 py-1 font-mono text-xs text-slate-600">#{machine.id}</span></div><div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-slate-100 pt-4 sm:grid-cols-4"><div><p className="text-[10px] uppercase tracking-wider text-slate-400">Price</p><p className="mt-1 font-mono text-xs text-slate-800">{machine.price} MST</p></div><div><p className="text-[10px] uppercase tracking-wider text-slate-400">Min. delta</p><p className="mt-1 font-mono text-xs text-slate-800">{machine.minimumDelta}</p></div><div><p className="text-[10px] uppercase tracking-wider text-slate-400">Device</p><p className="mt-1 text-xs text-slate-800">{machine.device}</p></div><div><p className="text-[10px] uppercase tracking-wider text-slate-400">Signer</p><p className="mt-1 font-mono text-xs text-slate-800">{formatAddress(machine.signer)}</p></div></div>{!compact && <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-sm text-slate-500">Current reading <strong className="font-mono text-slate-900">{machine.currentReading}</strong></span><Link href={`/jobs/create?machine=${machine.id}`} className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-cyan-600">Create Job <ArrowRight className="size-3.5" /></Link></div>}</div>
}

function ActivityItem({ item }: { item: ActivityType }) {
  const icon = item.type === 'PROOF_VERIFIED' || item.type === 'SETTLEMENT_CONFIRMED' ? CheckCircle2 : item.type === 'DEVICE_CONNECTED' ? Radio : item.type === 'JOB_WORKING' ? Play : FileCheck2
  const Icon = icon
  return <div className="flex gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Icon className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-medium text-slate-800">{item.title}</p><span className="text-xs text-slate-400">{formatTime(item.timestamp)}</span></div><p className="mt-0.5 text-xs text-slate-500">{item.description}</p>{item.metadata && <p className="mt-1 font-mono text-[11px] text-slate-400">{Object.entries(item.metadata).map(([key, value]) => `${key}: ${value}`).join(' · ')}</p>}</div></div>
}

function Dashboard() {
  const machines = getMachines()
  return <><PageHeader eyebrow="Machine-to-machine economy" title="Machines that get paid for work they can prove." description="Connect physical machines to programmable MST payments with verifiable work proofs." action={<Link href="/jobs/create" className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-cyan-600">Create Job <Plus className="size-4" /></Link>} /><div className="mb-10"><ProcessRail current={1} /></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Active Machines" value="2" detail="Ready for paid work" icon={Network} accent="text-cyan-600 bg-cyan-50" /><MetricCard label="Open Jobs" value="1" detail="Currently in progress" icon={Zap} accent="text-amber-600 bg-amber-50" /><MetricCard label="Completed Jobs" value="0" detail="Awaiting first settlement" icon={CheckCircle2} /><MetricCard label="MST Settled" value="0.0000" detail="Across all machines" icon={Wallet} /></div><div className="mt-10 grid gap-8 xl:grid-cols-[1fr_340px]"><section><SectionTitle title="Live Machine Network" description="Connected machines available for paid work." action={<Link href="/machines/1" className="text-xs font-medium text-cyan-600 hover:text-cyan-700">View all machines <ArrowRight className="ml-1 inline size-3.5" /></Link>} /><div className="grid gap-4 lg:grid-cols-2">{machines.map((machine) => <MachineCard key={machine.id} machine={machine} />)}</div></section><section><SectionTitle title="Recent Activity" description="Latest network events." /><div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5">{getActivities().slice(0, 3).map((item) => <ActivityItem key={item.id} item={item} />)}<Link href="/activity" className="flex items-center gap-1 text-xs font-medium text-cyan-600 hover:text-cyan-700">View activity <ArrowRight className="size-3.5" /></Link></div></section></div></>
}

function CreateJob() {
  const router = useRouter()
  const wallet = useWallet()
  const [selected, setSelected] = useState(1)
  const [state, setState] = useState<'idle' | 'confirming' | 'broadcasting' | 'done'>('idle')
  const [createdResult, setCreatedResult] = useState<CreatedJobResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const machine = getMachine(selected) || getMachines()[0]

  const handleCreate = async () => {
    setErrorMsg(null)

    if (!wallet.account) {
      try {
        await wallet.connect()
      } catch {
        setErrorMsg('Please connect your browser wallet to fund a job.')
      }
      return
    }

    if (!wallet.isCorrectNetwork) {
      try {
        await wallet.switchNetwork()
      } catch {
        setErrorMsg('Please switch to MST Testnet (Chain ID 91562037).')
        return
      }
    }

    try {
      setState('confirming')

      const result = await executeCreateJob(selected, machine.price, {
        onBroadcast: () => {
          setState('broadcasting')
        },
      })

      setCreatedResult(result)
      setState('done')

      // Register the created job in application memory
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

      wallet.refreshBalance()
    } catch (err: any) {
      console.error('[CreateJob] Failed:', err)
      setState('idle')
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        setErrorMsg('Transaction was cancelled in wallet.')
      } else if (isRateLimitError(err)) {
        setErrorMsg('MST Testnet RPC is temporarily rate-limited. Please wait a moment and retry.')
      } else {
        setErrorMsg(err.reason || err.message || 'Transaction failed. Please try again.')
      }
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Smart-contract escrow"
        title="Create Machine Job"
        description="Select a machine and fund the job through MST smart-contract escrow."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section>
          <SectionTitle title="Select a machine" description="Choose an online machine for this job." />
          <div className="flex flex-col gap-3">
            {getMachines().map((item) => (
              <button
                key={item.id}
                onClick={() => setSelected(item.id)}
                disabled={state === 'confirming' || state === 'broadcasting'}
                className={cn(
                  'rounded-xl border bg-white p-5 text-left transition',
                  selected === item.id ? 'border-cyan-500 ring-2 ring-cyan-100' : 'border-slate-200 hover:border-slate-300'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
                      <Droplets className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.service} · {item.device}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={item.status} />
                    {selected === item.id && (
                      <span className="flex size-5 items-center justify-center rounded-full bg-cyan-600 text-white">
                        <Check className="size-3" />
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex gap-6 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <span>
                    Price <strong className="ml-1 font-mono text-slate-800">{item.price} MST</strong>
                  </span>
                  <span>
                    Minimum delta <strong className="ml-1 font-mono text-slate-800">{item.minimumDelta}</strong>
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <aside>
          <SectionTitle title="Payment summary" />
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Escrow amount</span>
                <span className="font-mono font-medium text-slate-950">{machine.price} MST</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Buyer wallet</span>
                <span className="font-mono text-xs text-slate-800">
                  {wallet.isMounted && wallet.account ? formatAddress(wallet.account) : 'Not connected'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Wallet balance</span>
                <span className="font-mono text-slate-800">
                  {wallet.isMounted && wallet.balance !== null ? `${Number(wallet.balance).toFixed(4)} MST` : '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Network</span>
                <span className="text-slate-800">{wallet.isMounted && wallet.isCorrectNetwork ? 'MST Testnet' : 'Switch required'}</span>
              </div>

              {errorMsg && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  <p className="font-semibold">Creation Error</p>
                  <p className="mt-1">{errorMsg}</p>
                  {isRateLimitError(errorMsg) && (
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={state === 'confirming' || state === 'broadcasting'}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 font-medium text-white transition hover:bg-rose-800 disabled:opacity-50"
                    >
                      <RefreshCw size={13} />
                      Retry Escrow Funding
                    </button>
                  )}
                </div>
              )}

              <div className="border-t border-slate-100 pt-4">
                <button
                  disabled={state === 'confirming' || state === 'broadcasting' || state === 'done'}
                  onClick={handleCreate}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {state === 'confirming' ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Confirm in Wallet...
                    </>
                  ) : state === 'broadcasting' ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Waiting for Confirmation...
                    </>
                  ) : state === 'done' ? (
                    <>
                      <Check className="size-4" /> Job created
                    </>
                  ) : !wallet.isMounted || !wallet.account ? (
                    <>
                      <Wallet className="size-4" /> Connect Wallet to Fund
                    </>
                  ) : !wallet.isCorrectNetwork ? (
                    'Switch to MST Testnet'
                  ) : (
                    <>
                      Fund & Create Job <ArrowRight className="size-4" />
                    </>
                  )}
                </button>
              </div>
              <div className="flex gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-cyan-600" />
                Your payment is held in smart-contract escrow on MST Testnet and released only after a valid machine work proof is verified.
              </div>
            </div>
          </div>

          {state === 'done' && createdResult && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-800">Job #{createdResult.jobId} created</p>
              <p className="mt-1 text-xs text-emerald-700">
                Status: OPEN · Transaction: <span className="font-mono">{formatHash(createdResult.transactionHash)}</span>
              </p>
              <div className="mt-3 flex items-center justify-between">
                <Link
                  href={`/jobs/${createdResult.jobId}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                >
                  View live job #{createdResult.jobId} <ArrowRight className="size-3.5" />
                </Link>
                <a
                  href={`https://testnet.mstscan.com/tx/${createdResult.transactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800"
                >
                  Explorer <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  )
}

function JobProgress({ current }: { current: number }) {
  const items = [['PAYMENT', 'Escrow funded'], ['WORK', 'Machine operating'], ['PROVE', 'Waiting for proof'], ['VERIFY', 'Pending'], ['SETTLE', 'Pending']]
  return <div className="grid gap-2 md:grid-cols-5">{items.map(([title, sub], i) => <div key={title} className={cn('relative rounded-lg border p-4', i === current ? 'border-cyan-300 bg-cyan-50/70' : i < current ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white')}><div className="flex items-center gap-2"><span className={cn('flex size-6 items-center justify-center rounded-full text-[10px] font-bold', i < current ? 'bg-emerald-500 text-white' : i === current ? 'bg-cyan-600 text-white' : 'border border-slate-200 text-slate-400')}>{i < current ? <Check className="size-3" /> : i + 1}</span><span className={cn('text-[11px] font-semibold tracking-wide', i === current ? 'text-cyan-700' : i < current ? 'text-emerald-700' : 'text-slate-500')}>{title}</span></div><p className="mt-3 text-xs text-slate-500">{sub}</p></div>)}</div>
}

function LiveJob({ jobId = 3 }: { jobId?: number }) {
  const job = getJob(jobId) || getJob(3)!
  const machine = getMachine(job.machineId) || getMachine(1)!
  const [seconds] = useState(8)
  return <><PageHeader eyebrow={`Job #${job.id} · ${machine.name}`} title="Machine is working" description="The machine is currently performing the requested service." action={<StatusBadge status={job.status} />} /><div className="mb-8"><JobProgress current={1} /></div><div className="grid gap-6 xl:grid-cols-[1fr_360px]"><div className="flex flex-col gap-6"><section className="rounded-xl border border-slate-200 bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-4"><span className="flex size-12 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600"><Droplets className="size-6" /></span><div><h2 className="text-lg font-semibold text-slate-950">{machine.name}</h2><div className="mt-1 flex items-center gap-2"><StatusBadge status="ONLINE" /><span className="text-xs text-slate-500">Current operation: <strong className="font-medium text-slate-800">WATERING</strong></span></div></div></div><div className="text-right"><p className="text-[10px] uppercase tracking-wider text-slate-400">Elapsed</p><p className="mt-1 font-mono text-2xl font-semibold text-slate-950">{formatElapsed(seconds)}</p></div></div><div className="mt-8 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[52%] rounded-full bg-cyan-500 transition-all" /></div><div className="mt-3 flex justify-between text-xs text-slate-400"><span>Job started</span><span>Proof threshold: {machine.minimumDelta} delta</span></div></section><section><SectionTitle title="Live sensor data" description="Telemetry reported by the registered device." /><div className="grid gap-4 sm:grid-cols-3"><MetricCard label="Before" value="42" detail="Initial reading" icon={BarChart3} /><MetricCard label="Current" value="67" detail="Live reading" icon={ActivityIcon} accent="text-cyan-600 bg-cyan-50" /><MetricCard label="Delta" value="+25" detail="of 50 required" icon={Zap} accent="text-amber-600 bg-amber-50" /></div><div className="mt-4 rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between text-sm"><span className="text-slate-500">Progress toward proof</span><span className="font-mono font-medium text-slate-800">25 / {machine.minimumDelta}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-1/2 rounded-full bg-amber-500" /></div><p className="mt-3 text-xs text-slate-400">The machine must report a minimum delta of {machine.minimumDelta} before a signed work report can be submitted.</p></div></section></div><aside className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><FileCheck2 className="size-4 text-cyan-600" /><h2 className="text-sm font-semibold text-slate-950">Device-authenticated work report</h2></div><div className="mt-5 rounded-lg border border-blue-100 bg-blue-50/60 p-4"><div className="flex items-center gap-2 text-sm font-medium text-blue-800"><span className="size-2 animate-pulse rounded-full bg-blue-500" /> Waiting for signed proof...</div><p className="mt-2 text-xs leading-5 text-blue-700">The machine will submit a signed report after the service reaches its target.</p></div><dl className="mt-6 flex flex-col gap-4"><div><dt className="text-[10px] uppercase tracking-wider text-slate-400">Device signer</dt><dd className="mt-1 font-mono text-xs text-slate-800">{formatAddress(machine.signer)}</dd></div><div><dt className="text-[10px] uppercase tracking-wider text-slate-400">Signature</dt><dd className="mt-1 font-mono text-xs text-slate-400">Waiting...</dd></div><div><dt className="text-[10px] uppercase tracking-wider text-slate-400">Transaction</dt><dd className="mt-1 flex items-center gap-2 font-mono text-xs text-slate-800">{formatHash(job.transaction || '')} <Copy className="size-3 text-slate-400" /></dd></div></dl></aside></div></>
}

function ProofPage({ jobId = 3 }: { jobId?: number }) {
  const job = getJob(jobId) || getJob(3)!
  const proof = getJobProof(job.id) || getJobProof(3)!
  const checks = [['Device Report', 'Received'], ['EIP-712 Signature', 'Valid'], ['Registered Signer', `Node #${job.machineId}`], ['Service Hash', 'Matches Job'], ['Sensor Delta', '60 ≥ 50'], ['Timestamp', 'Within Deadline']]
  return <><PageHeader eyebrow={`Job #${job.id} · Verification complete`} title="Work Proof Verified" description="Device-authenticated work report verified against the MachineMandi job." action={<StatusBadge status="VERIFIED" />} /><div className="grid gap-6 lg:grid-cols-[1fr_380px]"><div className="flex flex-col gap-6"><section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6"><div className="flex items-center gap-4"><span className="flex size-12 items-center justify-center rounded-full bg-emerald-500 text-white"><CheckCircle2 className="size-6" /></span><div><h2 className="text-lg font-semibold text-emerald-900">All checks passed</h2><p className="mt-1 text-sm text-emerald-700">The signed machine report is ready for settlement.</p></div></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{checks.map(([label, value]) => <div key={label} className="flex items-center justify-between rounded-lg border border-emerald-100 bg-white/70 px-4 py-3"><span className="text-sm text-slate-600">{label}</span><span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700"><Check className="size-4" />{value}</span></div>)}</div></section><section><SectionTitle title="Verified readings" description="Telemetry values included in the device-authenticated report." /><div className="grid gap-4 sm:grid-cols-3"><MetricCard label="Pre reading" value="100" detail="Before service" icon={BarChart3} /><MetricCard label="Post reading" value="160" detail="After service" icon={BarChart3} accent="text-cyan-600 bg-cyan-50" /><MetricCard label="Delta" value="+60" detail="Threshold met" icon={CheckCircle2} accent="text-emerald-600 bg-emerald-50" /></div></section></div><EIP712Panel proof={proof} /></div></>
}

function EIP712Panel({ proof }: { proof: NonNullable<ReturnType<typeof getJobProof>> }) {
  const [open, setOpen] = useState(true)
  const rows = [['Domain', proof.eip712.domain], ['Version', proof.eip712.version], ['Chain ID', String(proof.eip712.chainId)], ['Verifying Contract', formatHash(proof.eip712.verifyingContract)], ['Primary Type', proof.eip712.primaryType], ['Signature', formatHash(proof.signature)]]
  return <section className="h-fit rounded-xl border border-slate-200 bg-white"><button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between p-5 text-left"><div><h2 className="text-sm font-semibold text-slate-950">EIP-712 details</h2><p className="mt-1 text-xs text-slate-500">Signed machine report payload</p></div>{open ? <ChevronDown className="size-4 text-slate-400" /> : <ChevronRight className="size-4 text-slate-400" />}</button>{open && <div className="border-t border-slate-100 p-5"><dl className="flex flex-col gap-4">{rows.map(([label, value]) => <div key={label}><dt className="text-[10px] uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-1 flex items-center justify-between gap-2 font-mono text-xs text-slate-800"><span className="truncate">{value}</span><Copy className="size-3.5 shrink-0 text-slate-400" /></dd></div>)}</dl></div>}</section>
}

function Settlement({ jobId = 3 }: { jobId?: number }) {
  const job = getJob(jobId) || getJob(3)!
  return <><PageHeader eyebrow={`Job #${job.id} · Settlement complete`} title="Machine Work Settled" description="Valid device-authenticated work proof accepted by the MachineMandi smart contract." action={<StatusBadge status="COMPLETED" />} /><div className="mb-8"><ProcessRail current={5} /></div><div className="grid gap-6 lg:grid-cols-[1fr_380px]"><div className="flex flex-col gap-6"><section className="rounded-xl border border-emerald-200 bg-white p-6"><div className="flex items-center gap-4"><span className="flex size-12 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="size-6" /></span><div><h2 className="text-lg font-semibold text-slate-950">Payment released to machine</h2><p className="mt-1 text-sm text-slate-500">Job #{job.id} completed successfully.</p></div></div><div className="mt-7 grid gap-5 sm:grid-cols-2"><div><p className="text-[10px] uppercase tracking-wider text-slate-400">Machine</p><p className="mt-1 text-sm font-medium text-slate-900">{job.machineName}</p></div><div><p className="text-[10px] uppercase tracking-wider text-slate-400">Work</p><p className="mt-1 text-sm text-slate-800">{job.service}</p></div><div><p className="text-[10px] uppercase tracking-wider text-slate-400">Before / after</p><p className="mt-1 font-mono text-sm text-slate-800">100 → 160 <span className="text-emerald-600">(+60)</span></p></div><div><p className="text-[10px] uppercase tracking-wider text-slate-400">Machine payout</p><p className="mt-1 font-mono text-sm font-medium text-slate-950">{job.amount} MST</p></div></div></section><section><SectionTitle title="Settlement flow" description="How this payment was released." /><div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-center sm:flex-row sm:justify-between sm:gap-3"><div><p className="text-xs font-semibold text-slate-800">ESCROW</p><p className="mt-1 text-[11px] text-slate-400">Funded</p></div><ArrowRight className="size-4 rotate-90 text-slate-300 sm:rotate-0" /><div><p className="text-xs font-semibold text-slate-800">VALID DEVICE PROOF</p><p className="mt-1 text-[11px] text-emerald-600">Verified</p></div><ArrowRight className="size-4 rotate-90 text-slate-300 sm:rotate-0" /><div><p className="text-xs font-semibold text-slate-800">SMART CONTRACT</p><p className="mt-1 text-[11px] text-slate-400">Executed</p></div><ArrowRight className="size-4 rotate-90 text-slate-300 sm:rotate-0" /><div><p className="text-xs font-semibold text-slate-800">MACHINE PAYOUT</p><p className="mt-1 text-[11px] text-emerald-600">Complete</p></div></div></section></div><aside className="h-fit rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-emerald-600" /><h2 className="text-sm font-semibold text-slate-950">Transaction confirmed</h2></div><div className="mt-4 rounded-lg bg-slate-50 p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-600">MST Testnet</p><dl className="mt-4 flex flex-col gap-3"><div><dt className="text-[10px] uppercase tracking-wider text-slate-400">Transaction</dt><dd className="mt-1 flex items-center gap-2 font-mono text-xs text-slate-800">{formatHash(job.transaction || '')} <Copy className="size-3 text-slate-400" /></dd></div><div><dt className="text-[10px] uppercase tracking-wider text-slate-400">Chain ID</dt><dd className="mt-1 font-mono text-xs text-slate-800">{NETWORK_CONFIG.chainId}</dd></div></dl></div>{job.transaction && <a href={`https://testnet.mstscan.com/tx/${job.transaction}`} target="_blank" rel="noreferrer" className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50">View on MST Explorer <ExternalLink className="size-3.5" /></a>}<Link href="/jobs/create" className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-3 py-2.5 text-xs font-medium text-white hover:bg-cyan-600">Create Another Job <Plus className="size-3.5" /></Link></aside></div></>
}

function JobsPage() {
  const [filter, setFilter] = useState('All')
  const jobs = getJobs()
  const filters = ['All', 'Active', 'Completed', 'Refunded']
  const filtered = filter === 'All' ? jobs : jobs.filter((job) => filter === 'Active' ? ['OPEN', 'WORKING'].includes(job.status) : job.status === filter.toUpperCase())
  return <><PageHeader eyebrow="Machine operations" title="Job History" description="Track machine jobs and settlement activity." action={<Link href="/jobs/create" className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-600"><Plus className="size-4" /> Create Job</Link>} /><div className="mb-5 flex gap-1 rounded-lg border border-slate-200 bg-white p-1 sm:w-fit">{filters.map((item) => <button key={item} onClick={() => setFilter(item)} className={cn('rounded-md px-3 py-2 text-xs font-medium transition', filter === item ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50')}>{item}</button>)}</div><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[760px] text-left"><thead className="border-b border-slate-100 bg-slate-50/80"><tr>{['Job', 'Machine', 'Service', 'Amount', 'Status', 'Proof', 'Transaction'].map((head) => <th key={head} className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{head}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((job) => <tr key={job.id} className="transition hover:bg-slate-50/60"><td className="px-5 py-4"><Link href={`/jobs/${job.id}`} className="font-mono text-sm font-medium text-cyan-700 hover:underline">#{job.id}</Link><p className="mt-0.5 text-[11px] text-slate-400">{formatTime(job.createdAt)}</p></td><td className="px-5 py-4 text-sm text-slate-700">{job.machineName}</td><td className="px-5 py-4 text-sm text-slate-600">{job.service.replace('Smart ', '')}</td><td className="px-5 py-4 font-mono text-xs text-slate-700">{job.amount} MST</td><td className="px-5 py-4"><StatusBadge status={job.status} /></td><td className="px-5 py-4">{job.status === 'COMPLETED' ? <StatusBadge status="VERIFIED" /> : <span className="text-xs text-slate-400">Pending</span>}</td><td className="px-5 py-4 font-mono text-xs text-slate-500">{formatHash(job.transaction || '')}</td></tr>)}</tbody></table></div></>
}

function MachineDetail({ machineId = 1 }: { machineId?: number }) {
  const machine = getMachine(machineId) || getMachine(1)!
  const chart = [44, 48, 46, 55, 52, 61, 67]
  return <><PageHeader eyebrow={`Registered machine · Node #${machine.id}`} title={machine.name} description="Physical machine connected to the MachineMandi network." action={<><StatusBadge status={machine.status} /><Link href={`/jobs/create?machine=${machine.id}`} className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-600">Create Job <ArrowRight className="size-4" /></Link></>} /><div className="grid gap-6 xl:grid-cols-[1fr_360px]"><div className="flex flex-col gap-6"><section className="rounded-xl border border-slate-200 bg-white p-6"><SectionTitle title="Machine configuration" description="Registered node and service details." /><div className="grid gap-5 sm:grid-cols-2"><div><p className="text-[10px] uppercase tracking-wider text-slate-400">Service</p><p className="mt-1 text-sm text-slate-800">{machine.service}</p></div><div><p className="text-[10px] uppercase tracking-wider text-slate-400">Price</p><p className="mt-1 font-mono text-sm text-slate-800">{machine.price} MST</p></div><div><p className="text-[10px] uppercase tracking-wider text-slate-400">Minimum delta</p><p className="mt-1 font-mono text-sm text-slate-800">{machine.minimumDelta}</p></div><div><p className="text-[10px] uppercase tracking-wider text-slate-400">Device</p><p className="mt-1 text-sm text-slate-800">{machine.device}</p></div><div><p className="text-[10px] uppercase tracking-wider text-slate-400">Registered signer</p><p className="mt-1 font-mono text-xs text-slate-800">{formatAddress(machine.signer)}</p></div><div><p className="text-[10px] uppercase tracking-wider text-slate-400">Service hash</p><p className="mt-1 font-mono text-xs text-slate-800">{formatHash(machine.serviceHash)}</p></div></div></section><section className="rounded-xl border border-slate-200 bg-white p-6"><SectionTitle title="Live telemetry" description="Recent sensor readings from the device." /><div className="flex items-end justify-between"><div><p className="text-xs uppercase tracking-wider text-slate-400">Current reading</p><p className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">{machine.currentReading}</p></div><span className="flex items-center gap-1.5 text-xs text-emerald-600"><span className="size-2 rounded-full bg-emerald-500" />Device online</span></div><div className="mt-6 h-36 w-full"><svg viewBox="0 0 700 140" className="size-full overflow-visible" preserveAspectRatio="none" role="img" aria-label="Sensor history line chart"><path d="M0 100 L116 82 L233 91 L350 56 L466 67 L583 32 L700 18" fill="none" stroke="#06b6d4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><path d="M0 100 L116 82 L233 91 L350 56 L466 67 L583 32 L700 18 L700 140 L0 140 Z" fill="url(#telemetryFill)" opacity="0.12" /><defs><linearGradient id="telemetryFill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#06b6d4" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>{chart.map((v, i) => <circle key={i} cx={i * 116.66} cy={140 - v * 1.2} r="4" fill="white" stroke="#06b6d4" strokeWidth="2" />)}</svg></div><div className="mt-3 flex justify-between text-[10px] text-slate-400"><span>08:00</span><span>08:05</span><span>08:10</span><span>08:15</span><span>Now</span></div></section></div><aside className="h-fit rounded-xl border border-slate-200 bg-white p-5"><SectionTitle title="Machine summary" /><dl className="flex flex-col gap-5"><div><dt className="text-[10px] uppercase tracking-wider text-slate-400">Node ID</dt><dd className="mt-1 font-mono text-sm text-slate-800">{machine.id}</dd></div><div><dt className="text-[10px] uppercase tracking-wider text-slate-400">Device status</dt><dd className="mt-1"><StatusBadge status={machine.status} /></dd></div><div><dt className="text-[10px] uppercase tracking-wider text-slate-400">Last proof</dt><dd className="mt-1"><StatusBadge status={machine.lastProof || 'VERIFIED'} /></dd></div><div><dt className="text-[10px] uppercase tracking-wider text-slate-400">Jobs completed</dt><dd className="mt-1 text-lg font-semibold text-slate-950">{machine.jobsCompleted}</dd></div><div><dt className="text-[10px] uppercase tracking-wider text-slate-400">Total earned</dt><dd className="mt-1 font-mono text-sm text-slate-800">{machine.totalEarned} MST</dd></div></dl></aside></div></>
}

function ActivityPage() {
  const events = getActivities()
  return <><PageHeader eyebrow="Network events" title="Activity" description="A chronological record of machine jobs, proofs, and settlement activity." /><div className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6"><div className="flex flex-col gap-7">{events.map((item, index) => <div key={item.id} className="relative">{index < events.length - 1 && <span className="absolute left-4 top-9 h-[calc(100%+1.75rem)] w-px bg-slate-200" />}<ActivityItem item={item} /></div>)}</div></div></>
}

export default function MachineMandiApp() {
  const pathname = usePathname()
  const proofMatch = pathname.match(/^\/jobs\/(\d+)\/proof$/)
  const settlementMatch = pathname.match(/^\/jobs\/(\d+)\/settlement$/)
  const jobMatch = pathname.match(/^\/jobs\/(\d+)$/)
  const machineMatch = pathname.match(/^\/machines\/(\d+)$/)

  let content: React.ReactNode
  if (pathname === '/') content = <Dashboard />
  else if (pathname === '/jobs/create') content = <CreateJob />
  else if (pathname === '/jobs') content = <JobsPage />
  else if (proofMatch) content = <ProofPage jobId={parseInt(proofMatch[1], 10)} />
  else if (settlementMatch) content = <Settlement jobId={parseInt(settlementMatch[1], 10)} />
  else if (jobMatch) content = <LiveJob jobId={parseInt(jobMatch[1], 10)} />
  else if (machineMatch) content = <MachineDetail machineId={parseInt(machineMatch[1], 10)} />
  else if (pathname === '/activity') content = <ActivityPage />
  else content = <Dashboard />

  return <div className="min-h-screen bg-[#f8fafc] text-slate-950"><Navbar /><main className="mx-auto max-w-[1440px] px-5 py-8 lg:px-8 lg:py-10">{content}</main><footer className="mx-auto max-w-[1440px] px-5 pb-8 lg:px-8"><div className="border-t border-slate-200 pt-6 text-xs text-slate-400"><span>MachineMandi · MST Testnet · Chain ID {NETWORK_CONFIG.chainId}</span></div></footer></div>
}

export { Dashboard, CreateJob, LiveJob, ProofPage, Settlement, JobsPage, MachineDetail, ActivityPage }
