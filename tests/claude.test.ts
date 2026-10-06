import { describe, expect, it } from 'vitest'
import { subscriptionEnv } from '../src/main/claude'

describe('subscriptionEnv', () => {
  it('drops API credentials so claude uses the subscription', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    process.env.ANTHROPIC_AUTH_TOKEN = 'tok-test'
    const env = subscriptionEnv()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(env.PATH).toBe(process.env.PATH)
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_AUTH_TOKEN
  })
})
