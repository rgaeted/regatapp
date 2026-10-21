import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { guardarSesion } from '@/lib/sesion/guardar'
import type { SesionInput } from '@/lib/schemas/sesion'

const input: SesionInput = {
  id: '11111111-1111-4111-8111-111111111111',
  atleta_id: '22222222-2222-4222-8222-222222222222',
  tipo: 'entrenamiento',
  modalidad: 'ergometro',
  fecha: '2026-10-21T12:00:00.000Z',
  splits: [],
}
const foto = { captura_id: '33333333-3333-4333-8333-333333333333', verificado: true, editado_manual: false }

function cliente(respuesta: { data: unknown; error: { code: string; message: string } | null }) {
  const rpc = vi.fn(async () => respuesta)
  return { supabase: { rpc } as unknown as SupabaseClient, rpc }
}

describe('guardarSesion (parámetros y errores)', () => {
  it('sin foto no manda p_ocr (así funciona con la firma anterior de la RPC)', async () => {
    const { supabase, rpc } = cliente({ data: input.id, error: null })
    await guardarSesion(supabase, input)
    const params = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(params[0]).toBe('guardar_sesion')
    expect('p_ocr' in params[1]).toBe(false)
  })

  it('con foto manda p_ocr', async () => {
    const { supabase, rpc } = cliente({ data: input.id, error: null })
    await guardarSesion(supabase, input, foto)
    const params = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(params[1].p_ocr).toEqual(foto)
  })

  it('una foto ya usada da un mensaje propio', async () => {
    const { supabase } = cliente({ data: null, error: { code: 'RG001', message: 'foto ya usada' } })
    expect(await guardarSesion(supabase, input, foto)).toEqual({ ok: false, error: 'Esta foto ya se guardó como una sesión.' })
  })

  it('un error desconocido no filtra el mensaje de la base', async () => {
    const { supabase } = cliente({ data: null, error: { code: 'XX000', message: 'detalle interno secreto' } })
    const r = await guardarSesion(supabase, input)
    expect(JSON.stringify(r)).not.toContain('secreto')
  })
})
