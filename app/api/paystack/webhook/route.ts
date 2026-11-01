import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { collection, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { isValidPaymentReference, verifyTimingSafeHash } from '@/lib/paystack-server'

/**
 * POST /api/paystack/webhook
 * Verifies the x-paystack-signature header using timing-safe HMAC SHA-512 and PAYSTACK_SECRET_KEY
 * to guarantee the webhook event genuinely originated from Paystack.
 */
export async function POST(req: NextRequest) {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const signature = req.headers.get('x-paystack-signature')
    if (!signature) {
      return NextResponse.json({ error: 'Missing Paystack signature' }, { status: 401 })
    }

    const rawBody = await req.text()
    const expectedHash = crypto
      .createHmac('sha512', secretKey)
      .update(rawBody)
      .digest('hex')

    if (!verifyTimingSafeHash(expectedHash, signature.trim())) {
      console.warn('Invalid Paystack webhook signature rejected')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = JSON.parse(rawBody)

    if (event.event === 'charge.success' && event.data) {
      const tx = event.data
      const ref = tx.reference
      if (isValidPaymentReference(ref) && tx.status === 'success') {
        try {
          const ordersRef = collection(db, 'orders')
          const q = query(ordersRef, where('paymentReference', '==', ref))
          const snap = await getDocs(q)
          for (const orderDoc of snap.docs) {
            const orderData = orderDoc.data()
            if (orderData.paymentStatus !== 'paid') {
              await updateDoc(orderDoc.ref, {
                paymentStatus: 'paid',
                paymentChannel: tx.channel || 'paystack',
                updatedAt: serverTimestamp(),
              })
            }
          }
        } catch (dbErr) {
          console.warn('Webhook order reconciliation notice:', dbErr)
        }
      }
      console.log(`Verified Paystack Webhook: charge.success for ref ${ref}`)
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error) {
    console.error('Paystack webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

