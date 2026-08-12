'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

export default function HomeClient() {
  // ROI Calculator State
  const [deviceVolume, setDeviceVolume] = useState(250)
  const [teamMembers, setTeamMembers] = useState(5)

  // Calculated Savings
  const hoursSavedPerMonth = Math.round((deviceVolume * 0.15) + (teamMembers * 8))
  const dollarsSavedPerMonth = Math.round(hoursSavedPerMonth * 35 + (deviceVolume * 4.2))

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index)
  }

  const faqs = [
    {
      q: "Is my company data kept strictly private and isolated?",
      a: "Yes. Every account runs with Row Level Security (RLS) and organization-level encryption. Your deals, client prices, landed costs, and treasury P&L statements are 100% isolated and visible only to authorized members of your company."
    },
    {
      q: "How does the $30/month pricing work?",
      a: "For just $30/month flat rate, you get full access to all ERP modules — Deals management, IMEI tracking, B2B Invoicing, Logistics freight allocation, and Financial Treasury P&L. There are no hidden setup fees or per-user surcharges."
    },
    {
      q: "Can I import my existing deals and inventory from Excel?",
      a: "Absolutely. Mobitech ERP includes 1-click bulk Excel/CSV importers for inventory items, past invoices, and deal packages, allowing your team to migrate in minutes."
    },
    {
      q: "How does local-to-cloud synchronization work?",
      a: "If you run a local master ERP server in your office or warehouse, our built-in sync engine automatically synchronizes live deals, inventory movements, and attached PDF documents with the cloud so team members on the road can view real-time updates."
    },
    {
      q: "What support is included with my subscription?",
      a: "Every subscription includes 24/7 technical support, automated daily cloud backups, continuous feature updates, and guided onboarding assistance."
    }
  ]

  return (
    <div style={{
      backgroundColor: '#07090e',
      color: '#f8fafc',
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      minHeight: '100vh',
      overflowX: 'hidden',
      position: 'relative'
    }}>
      {/* Background Radial Glow Effects */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        left: '20%',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(0, 0, 0, 0) 70%)',
        pointerEvents: 'none',
        zIndex: 0
      }} />
      <div style={{
        position: 'absolute',
        top: '30%',
        right: '-5%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, rgba(0, 0, 0, 0) 70%)',
        pointerEvents: 'none',
        zIndex: 0
      }} />

      {/* ── Top Navigation ────────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(16px)',
        backgroundColor: 'rgba(7, 9, 14, 0.85)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '16px 24px'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* Logo */}
          <Link href="/home" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
              </svg>
            </div>
            <div>
              <span style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.5px' }}>
                Mobitech<span style={{ color: '#818cf8' }}>ERP</span>
              </span>
              <span style={{ display: 'block', fontSize: '10px', color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
                Operations & Treasury Platform
              </span>
            </div>
          </Link>

          {/* Nav Links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <a href="#features" style={{ color: 'rgba(255, 255, 255, 0.7)', textDecoration: 'none', fontSize: '14px', fontWeight: 500, transition: 'color 0.2s' }}>Features</a>
            <a href="#calculator" style={{ color: 'rgba(255, 255, 255, 0.7)', textDecoration: 'none', fontSize: '14px', fontWeight: 500, transition: 'color 0.2s' }}>ROI Calculator</a>
            <a href="#pricing" style={{ color: 'rgba(255, 255, 255, 0.7)', textDecoration: 'none', fontSize: '14px', fontWeight: 500, transition: 'color 0.2s' }}>Pricing</a>
            <a href="#faq" style={{ color: 'rgba(255, 255, 255, 0.7)', textDecoration: 'none', fontSize: '14px', fontWeight: 500, transition: 'color 0.2s' }}>FAQ</a>
          </nav>

          {/* Action CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/login" style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.2s'
            }}>
              Sign In
            </Link>
            <a href="#pricing" style={{
              padding: '8px 20px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
              transition: 'all 0.2s'
            }}>
              Start Trial ($30/mo)
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero Section ───────────────────────────────────────────────────────────── */}
      <section style={{ padding: '80px 24px 60px', textAlign: 'center', position: 'relative', zIndex: 10 }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 16px',
            borderRadius: '100px',
            backgroundColor: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            marginBottom: '24px'
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 10px #10b981' }}></span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#a5b4fc' }}>
              Built Exclusively for Phone Wholesalers & Electronics Traders
            </span>
          </div>

          {/* Main Headline */}
          <h1 style={{
            fontSize: '48px',
            lineHeight: 1.15,
            fontWeight: 800,
            letterSpacing: '-1.5px',
            color: '#ffffff',
            marginBottom: '20px'
          }}>
            The Operating System for <br />
            <span style={{
              background: 'linear-gradient(135deg, #818cf8 0%, #c084fc 50%, #f472b6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Bulk Electronics & Mobile Phone Trading
            </span>
          </h1>

          {/* Subheadline */}
          <p style={{
            fontSize: '18px',
            lineHeight: 1.6,
            color: 'rgba(255, 255, 255, 0.7)',
            maxWidth: '720px',
            margin: '0 auto 36px'
          }}>
            Master bulk deal auctions, IMEI/serial QC refurbishment stages, multi-leg freight landed costs, and real-time financial treasury P&L — in one seamless cloud workspace.
          </p>

          {/* CTA Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '48px' }}>
            <a href="#pricing" style={{
              padding: '14px 32px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              color: '#ffffff',
              fontSize: '16px',
              fontWeight: 700,
              textDecoration: 'none',
              boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)',
              transition: 'transform 0.2s'
            }}>
              Start 14-Day Free Trial ($30/mo)
            </a>
            <Link href="/login" style={{
              padding: '14px 28px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: '#ffffff',
              fontSize: '16px',
              fontWeight: 600,
              textDecoration: 'none'
            }}>
              Live Demo Access →
            </Link>
          </div>

          {/* Ticker / Trust Stats */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '40px',
            padding: '18px 24px',
            borderRadius: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            maxWidth: '780px',
            margin: '0 auto 60px'
          }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#818cf8' }}>$2.3M+</div>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>Invoiced Deals Managed</div>
            </div>
            <div style={{ width: '1px', height: '30px', backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#a855f7' }}>Sub-0.3s</div>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>Optimized Query Speed</div>
            </div>
            <div style={{ width: '1px', height: '30px', backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#34d399' }}>100%</div>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>RLS Data Isolation</div>
            </div>
          </div>
        </div>

        {/* Hero Screenshot Frame */}
        <div style={{
          maxWidth: '1100px',
          margin: '0 auto',
          position: 'relative',
          borderRadius: '16px',
          padding: '10px',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(168, 85, 247, 0.15) 100%)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)'
        }}>
          <div style={{
            borderRadius: '12px',
            overflow: 'hidden',
            backgroundColor: '#0d111a',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <Image
              src="/erp_hero_preview.jpg"
              alt="Mobitech ERP Dashboard Showcase"
              width={1100}
              height={620}
              style={{ width: '100%', height: 'auto', display: 'block' }}
              priority
            />
          </div>
        </div>
      </section>

      {/* ── Feature Modules Grid ─────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: '80px 24px', backgroundColor: 'rgba(255, 255, 255, 0.015)', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '60px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Core Modules</span>
            <h2 style={{ fontSize: '36px', fontWeight: 800, letterSpacing: '-1px', color: '#ffffff', marginTop: '8px' }}>
              Engineered Specifically for Phone & Tech Traders
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {/* Feature 1 */}
            <div style={{
              padding: '30px',
              borderRadius: '16px',
              backgroundColor: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              transition: 'transform 0.2s'
            }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '24px' }}>📦</span>
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', marginBottom: '12px' }}>Bulk Deal Margins</h3>
              <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.6 }}>
                Track landed cost per unit across ATT, EcoATM, and custom auction deals. Calculates Amex cashback profit multipliers and true gross profit per SKU.
              </p>
            </div>

            {/* Feature 2 */}
            <div style={{
              padding: '30px',
              borderRadius: '16px',
              backgroundColor: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(168, 85, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '24px' }}>🔍</span>
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', marginBottom: '12px' }}>IMEI & Serial QC Pipeline</h3>
              <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.6 }}>
                Move individual units through Separated, Refurbishing, QC Done, Ready to Sell, and Assigned stages. Maintain complete historical logs per device.
              </p>
            </div>

            {/* Feature 3 */}
            <div style={{
              padding: '30px',
              borderRadius: '16px',
              backgroundColor: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '24px' }}>🚢</span>
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', marginBottom: '12px' }}>Multi-Leg Logistics</h3>
              <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.6 }}>
                Allocate freight charges, SB Technology fees, USA-to-DXB shipping costs, and customs duties directly onto individual deal inventory landed costs.
              </p>
            </div>

            {/* Feature 4 */}
            <div style={{
              padding: '30px',
              borderRadius: '16px',
              backgroundColor: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(244, 114, 182, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '24px' }}>📊</span>
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', marginBottom: '12px' }}>Financial Treasury P&L</h3>
              <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.6 }}>
                Real-time automated Profit & Loss statements, wire transfer audit trails, credit line payoff limits (Amex, Turbo, SB Cash), and partner settlements.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Interactive ROI Calculator ────────────────────────────────────────────── */}
      <section id="calculator" style={{ padding: '80px 24px', position: 'relative' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', backgroundColor: '#0d111a', borderRadius: '24px', border: '1px solid rgba(99, 102, 241, 0.25)', padding: '40px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Calculate Your Savings</span>
            <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#ffffff', marginTop: '6px' }}>See Your Estimated Monthly ROI</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px', alignItems: 'center' }}>
            {/* Sliders */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Monthly Devices / Units Handled</label>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#818cf8' }}>{deviceVolume} units</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="2000"
                  step="25"
                  value={deviceVolume}
                  onChange={(e) => setDeviceVolume(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#6366f1', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Active Team Members</label>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#c084fc' }}>{teamMembers} users</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="30"
                  step="1"
                  value={teamMembers}
                  onChange={(e) => setTeamMembers(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#a855f7', cursor: 'pointer' }}
                />
              </div>
            </div>

            {/* Results Display */}
            <div style={{ padding: '24px', borderRadius: '16px', backgroundColor: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', fontWeight: 600 }}>Estimated Hours Saved</div>
              <div style={{ fontSize: '36px', fontWeight: 800, color: '#34d399', margin: '4px 0 16px' }}>{hoursSavedPerMonth} hrs / mo</div>

              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', fontWeight: 600 }}>Estimated Net Profit Boost</div>
              <div style={{ fontSize: '36px', fontWeight: 800, color: '#ffffff', marginTop: '4px' }}>${dollarsSavedPerMonth.toLocaleString()} / mo</div>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>Calculated from manual error reduction & time saved</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing Plan ($30/mo) ──────────────────────────────────────────────────── */}
      <section id="pricing" style={{ padding: '80px 24px', backgroundColor: 'rgba(255, 255, 255, 0.015)' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Simple Transparent Pricing</span>
          <h2 style={{ fontSize: '38px', fontWeight: 800, color: '#ffffff', marginTop: '8px', marginBottom: '12px' }}>
            One Plan. Everything Included.
          </h2>
          <p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.65)', marginBottom: '40px' }}>
            No per-user surcharges. No hidden setup costs. Start with a 14-day free trial.
          </p>

          {/* Pricing Card */}
          <div style={{
            borderRadius: '24px',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.1) 100%)',
            border: '2px solid #6366f1',
            padding: '40px',
            position: 'relative',
            boxShadow: '0 20px 50px rgba(99, 102, 241, 0.25)'
          }}>
            {/* Popular Badge */}
            <div style={{
              position: 'absolute',
              top: '-14px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: '#6366f1',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 800,
              padding: '4px 16px',
              borderRadius: '100px',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              Most Popular
            </div>

            <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff' }}>Professional Plan</h3>
            <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '24px' }}>Everything your trading company needs</p>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '6px', marginBottom: '30px' }}>
              <span style={{ fontSize: '56px', fontWeight: 800, color: '#ffffff', letterSpacing: '-1.5px' }}>$30</span>
              <span style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.6)' }}>/ month</span>
            </div>

            {/* Checklist */}
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px 0', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                'Unlimited Deals, Invoices & Clients',
                'Unit-level IMEI & Serial Tracking Pipeline',
                'Multi-Leg Freight & Landed Cost Allocator',
                'Real-Time Financial Treasury P&L Statements',
                'Multi-Channel Online Sales (Amazon & Revibe)',
                'Role-Based Security (Sales, Logistics, Admin)',
                'Automated Daily Cloud Backups (Supabase)',
                '24/7 Priority Email & Chat Support'
              ].map((item, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px', color: 'rgba(255, 255, 255, 0.85)' }}>
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span>
                  {item}
                </li>
              ))}
            </ul>

            <Link href="/login" style={{
              display: 'block',
              width: '100%',
              padding: '16px 0',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              color: '#ffffff',
              fontSize: '16px',
              fontWeight: 700,
              textDecoration: 'none',
              boxShadow: '0 8px 20px rgba(99, 102, 241, 0.4)'
            }}>
              Start Your 14-Day Free Trial
            </Link>
            <span style={{ display: 'block', fontSize: '12px', color: 'rgba(255, 255, 255, 0.4)', marginTop: '12px' }}>
              No credit card required to test • Cancel anytime
            </span>
          </div>
        </div>
      </section>

      {/* ── FAQ Accordion ──────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '50px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Got Questions?</span>
            <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#ffffff', marginTop: '6px' }}>Frequently Asked Questions</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                onClick={() => toggleFaq(idx)}
                style={{
                  borderRadius: '12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.025)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '20px 24px',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: 0 }}>{faq.q}</h3>
                  <span style={{ fontSize: '20px', color: '#818cf8', fontWeight: 700 }}>{openFaq === idx ? '−' : '+'}</span>
                </div>
                {openFaq === idx && (
                  <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.6, marginTop: '12px', marginBottom: 0 }}>
                    {faq.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────────────── */}
      <footer style={{
        padding: '40px 24px',
        backgroundColor: '#040508',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        fontSize: '13px',
        color: 'rgba(255, 255, 255, 0.5)'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <span style={{ fontWeight: 800, color: '#ffffff' }}>MobitechERP</span> • Operations & Treasury Platform
          </div>
          <div>
            © {new Date().getFullYear()} Mobitech Wireless • SB Technology • Turbo Logistics. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
