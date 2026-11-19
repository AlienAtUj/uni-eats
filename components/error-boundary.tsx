'use client'

import React, { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  errorMessage: string
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected rendering error occurred.',
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Global ErrorBoundary caught error:', error, info.componentStack)
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  handleResetStateAndReload = () => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('unieats_screen')
        sessionStorage.removeItem('dash_active_restaurant')
      } catch {}
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-[#F4F4F5] px-6 text-center font-sans text-[#09090B]">
          <div className="w-full max-w-sm rounded-md border border-zinc-200 bg-white p-6">
            <p className="text-[11px] font-black uppercase tracking-widest text-[#DC2626]">
              RECOVERABLE ERROR
            </p>
            <h1 className="mt-1 text-lg font-black text-[#09090B]">
              Something went wrong
            </h1>
            <p className="mt-2 text-xs text-[#71717A] break-words">
              {this.state.errorMessage}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full rounded-sm bg-[#287d46] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-[#216639]"
              >
                Reload Page
              </button>
              <button
                type="button"
                onClick={this.handleResetStateAndReload}
                className="w-full rounded-sm border border-zinc-200 bg-[#F4F4F5] px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-[#09090B] hover:bg-zinc-200"
              >
                Reset View & Reload
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
