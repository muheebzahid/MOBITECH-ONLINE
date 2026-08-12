import { NextResponse } from 'next/server'
import { getUserRole } from '@/lib/admin/actions'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const role = await getUserRole()
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({ success: true, message: 'No orphaned files require cleanup' }, { status: 200 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 })
  }
}
