import { NextRequest, NextResponse } from 'next/server'
import {
  computeVerifiedOrderTotalCents,
  createIntegrityHash,
  isReferenceAlreadyUsed,
  isValidPaymentReference,
  verifyTimingSafeHash,
  type CheckoutItemInput,
} from '@/lib/paystack-server'

/**
 * POST /api/paystack/verify
 * Server-to-server verification of a Paystack payment reference.
 * Prevents fake client-side "payment success" spoofing, replay attacks, and cart price tampering.
 */
export async function POST(req: NextRequest) {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json(
        { verified: false, error: 'Paystack Secret Key (PAYSTACK_SECRET_KEY) is not configured on the server.' },
        { status: 500 }
      )
    }

    const body = await req.json()
    const { reference, expectedAmountZar, items } = body as {
      reference?: unknown
      expectedAmountZar?: number
      items?: CheckoutItemInput[]
    }

    if (!isValidPaymentReference(reference)) {
      return NextResponse.json(
        { verified: false, error: 'Invalid or missing payment reference format.' },
        { status: 400 }
      )
    }

    // 1. Prevent replay attacks (reusing a previously verified payment reference)
    if (await isReferenceAlreadyUsed(reference)) {
      return NextResponse.json(
        { verified: false, error: 'This payment reference has already been used for an order.' },
        { status: 409 }
      )
    }

    // 2. Call Paystack Verify API directly from server
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    )

    const data = await verifyRes.json()

    if (!verifyRes.ok || !data.status || !data.data) {
      return NextResponse.json(
        { verified: false, error: data.message || 'Could not verify transaction with Paystack' },
        { status: 400 }
      )
    }

    const tx = data.data

    // 3. Check payment status is strictly 'success'
    if (tx.status !== 'success') {
      return NextResponse.json(
        { verified: false, error: `Payment status is '${tx.status}', not 'success'` },
        { status: 400 }
      )
    }

    // 4. Check currency is strictly ZAR
    if (tx.currency && String(tx.currency).toUpperCase() !== 'ZAR') {
      return NextResponse.json(
        { verified: false, error: `Unexpected payment currency: ${tx.currency}` },
        { status: 400 }
      )
    }

    // 5. Recompute authoritative expected amount from Firestore product prices
    const { amountInCents: authoritativeCents } = await computeVerifiedOrderTotalCents(
      items,
      expectedAmountZar
    )
    const metadataCents = Number(tx.metadata?.verifiedAmountCents || 0)
    const requiredCents = Math.max(authoritativeCents, metadataCents)

    if (typeof tx.amount !== 'number' || tx.amount < requiredCents) {
      return NextResponse.json(
        {
          verified: false,
          error: `Amount mismatch: paid ${tx.amount} cents, expected ${requiredCents} cents`,
        },
        { status: 400 }
      )
    }

    // 6. Verify cryptographic integrity hash if transaction was initialized server-side
    if (tx.metadata?.integrityHash && metadataCents > 0) {
      const expectedIntegrity = createIntegrityHash(
        secretKey,
        tx.reference,
        metadataCents,
        'ZAR'
      )
      if (!verifyTimingSafeHash(expectedIntegrity, String(tx.metadata.integrityHash))) {
        return NextResponse.json(
          { verified: false, error: 'Payment metadata integrity verification failed.' },
          { status: 400 }
        )
      }
    }

    return NextResponse.json({
      verified: true,
      reference: tx.reference,
      amountZar: tx.amount / 100,
      currency: tx.currency,
      channel: tx.channel,
      paidAt: tx.paid_at,
    })
  } catch (error: any) {
    console.error('Paystack verification error:', error)
    return NextResponse.json(
      { verified: false, error: 'Internal server error verifying payment' },
      { status: 500 }
    )
  }
}

