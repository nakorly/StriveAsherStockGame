import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/supabaseAdmin'

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('user_id')
    if (!userId) {
      return NextResponse.json({ success: false, error: 'user_id is required' }, { status: 400 })
    }

    const supabase = getAdminSupabase()

    const [{ data: holdings }, { data: history }] = await Promise.all([
      supabase
        .from('portfolios')
        .select('symbol, name, shares, price, purchase_price, total_value, change, change_percent')
        .eq('user_id', userId),
      supabase
        .from('monthly_performance')
        .select('year, month, start_total_value, end_total_value, return_percent, updated_at')
        .eq('user_id', userId)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(24),
    ])

    return NextResponse.json({ success: true, holdings: holdings ?? [], history: history ?? [] })
  } catch (err: any) {
    console.error('leaderboard-details error:', err)
    return NextResponse.json({ success: false, error: 'Failed to load details' }, { status: 500 })
  }
}
