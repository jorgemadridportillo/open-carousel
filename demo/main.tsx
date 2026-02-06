import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Carousel, CarouselArrow } from '../src'
import './styles.css'

// -----------------------------------------------------------------------------
// Data
// -----------------------------------------------------------------------------

const demoItems = [
    { id: '1', title: 'Infinite Scroll', description: 'Seamless looping with teleportation', icon: '🔄', tag: 'Core' },
    { id: '2', title: 'Drag & Swipe', description: 'Natural touch and mouse interactions', icon: '👆', tag: 'UX' },
    { id: '3', title: 'Momentum', description: 'Physics-based scroll momentum', icon: '🚀', tag: 'Physics' },
    { id: '4', title: 'CSS Snap', description: 'Native scroll-snap alignment', icon: '🎯', tag: 'CSS' },
    { id: '5', title: 'Visual Effects', description: 'Scale and opacity transitions', icon: '✨', tag: 'Effects' },
    { id: '6', title: 'Responsive', description: 'CSS variable-based sizing', icon: '📱', tag: 'Layout' },
    { id: '7', title: 'Accessible', description: 'ARIA labels and keyboard nav', icon: '♿', tag: 'A11y' },
    { id: '8', title: 'Debug Tools', description: 'Built-in logging system', icon: '🐛', tag: 'Dev' },
    { id: '9', title: 'Zero Deps', description: 'Only React as peer dependency', icon: '📦', tag: 'Size' },
    { id: '10', title: 'TypeScript', description: 'Full type definitions included', icon: '💙', tag: 'DX' },
]

const normalItems = [
    { id: 'n1', title: 'Mountain View', location: 'Swiss Alps', img: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&h=300&fit=crop' },
    { id: 'n2', title: 'Ocean Breeze', location: 'Maldives', img: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=300&fit=crop' },
    { id: 'n3', title: 'Urban Jungle', location: 'Tokyo', img: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=400&h=300&fit=crop' },
    { id: 'n4', title: 'Desert Storm', location: 'Sahara', img: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=400&h=300&fit=crop' },
    { id: 'n5', title: 'Forest Mist', location: 'Oregon', img: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=300&fit=crop' },
    { id: 'n6', title: 'Canyon Echo', location: 'Arizona', img: 'https://images.unsplash.com/photo-1474044159687-1ee9fc5e2600?w=400&h=300&fit=crop' },
    { id: 'n7', title: 'Northern Lights', location: 'Iceland', img: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=400&h=300&fit=crop' },
    { id: 'n8', title: 'Golden Gate', location: 'San Francisco', img: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=400&h=300&fit=crop' },
    { id: 'n9', title: 'Great Barrier Reef', location: 'Australia', img: 'https://images.unsplash.com/photo-1582967788606-a171f1080ca8?w=400&h=300&fit=crop' },
]

const coolItems = [
    { id: 'c1', title: 'Cyberpunk', year: '2077', img: 'https://images.unsplash.com/photo-1555685812-4b943f3db9f0?w=600&h=800&fit=crop', color: '#f0db4f' },
    { id: 'c2', title: 'Neon Nights', year: '1984', img: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=600&h=800&fit=crop', color: '#ff00ff' },
    { id: 'c3', title: 'Future Tech', year: '2142', img: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=800&fit=crop', color: '#00ffff' },
    { id: 'c4', title: 'Space Age', year: '2200', img: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&h=800&fit=crop', color: '#ffffff' },
]

// -----------------------------------------------------------------------------
// Components
// -----------------------------------------------------------------------------

function DemoCard({ item }: { item: typeof demoItems[0] }) {
    return (
        <div className="demo-card">
            <div className="card-image" />
            <div className="card-icon">{item.icon}</div>
            <div className="card-content">
                <span className="card-tag">{item.tag}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
            </div>
        </div>
    )
}

function NormalCard({ item }: { item: typeof normalItems[0] }) {
    return (
        <div className="visual-card-normal">
            <img src={item.img} alt={item.title} loading="lazy" />
            <div className="content">
                <h3>{item.title}</h3>
                <p>{item.location}</p>
            </div>
        </div>
    )
}

function CoolCard({ item }: { item: typeof coolItems[0] }) {
    return (
        <div className="visual-card-cool">
            <div className="bg-image" style={{ backgroundImage: `url(${item.img})` }} />
            <div className="overlay" />
            <div className="content">
                <span className="tag">{item.year}</span>
                <h3>{item.title}</h3>
            </div>
        </div>
    )
}

// -----------------------------------------------------------------------------
// App
// -----------------------------------------------------------------------------

function App() {
    return (
        <>
            <section className="hero">
                <h1>open-carousel</h1>
                <p className="tagline">
                    A high-performance, infinite-scroll React carousel with smooth animations,
                    teleportation, and minimal bundle size.
                </p>
                <div className="badges">
                    <span className="badge"><span className="icon">⚡</span> High Performance</span>
                    <span className="badge"><span className="icon">🔄</span> Infinite Scroll</span>
                    <span className="badge"><span className="icon">📦</span> 87KB ESM</span>
                    <span className="badge"><span className="icon">✅</span> 167 Tests</span>
                </div>
                <div className="install-code">
                    <span className="prompt">$</span>
                    <span>npm install open-carousel</span>
                </div>
            </section>

            {/* 1. Feature Showcase (Infinite) */}
            <h2 className="section-title">✨ Feature Showcase (Infinite)</h2>
            <Carousel
                items={demoItems}
                getItemKey={(item) => item.id}
                renderItem={(item) => <DemoCard item={item} />}
                infinite
                gap={20}
                verticalPadding="40px"
                snapType="mandatory"
                debugId="demo-features"
                initialIndex={0}
            />

            {/* 2. Finite Carousel */}
            <h2 className="section-title">🛑 Finite Scroll (No Loop)</h2>
            <Carousel
                items={normalItems}
                getItemKey={(item) => item.id}
                renderItem={(item) => <NormalCard item={item} />}
                infinite={false}
                gap={16}
                verticalPadding="20px"
                snapType="proximity"
                debugId="demo-finite"
                disableOpacityEffect
                disableScaleEffect
            />



            {/* 4. Documentation */}
            <section className="doc-section">
                <h2>Documentation</h2>

                <div className="doc-card">
                    <h3>📦 Installation</h3>
                    <pre className="install-code" style={{ marginTop: '16px', display: 'block' }}>
                        <span className="prompt">$</span> npm install open-carousel
                    </pre>
                </div>

                <div className="doc-card">
                    <h3>🚀 Quick Start</h3>
                    <pre style={{
                        background: 'rgba(0,0,0,0.3)',
                        padding: '16px',
                        borderRadius: '8px',
                        overflowX: 'auto',
                        color: '#d1d5db',
                        fontSize: '0.875rem',
                        marginTop: '16px'
                    }}>
                        {`import { Carousel } from 'open-carousel'
import 'open-carousel/styles.css'

function MyCarousel() {
  return (
    <Carousel
      items={items}
      getItemKey={(item) => item.id}
      renderItem={(item) => <div>{item.title}</div>}
      infinite
    />
  )
}`}
                    </pre>
                </div>

                <div className="doc-card">
                    <h3>⚙️ Props API</h3>
                    <table className="props-table">
                        <thead>
                            <tr>
                                <th>Prop</th>
                                <th>Type</th>
                                <th>Default</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><code>items</code><span className="required">*</span></td>
                                <td>Array&lt;T&gt;</td>
                                <td>-</td>
                                <td>Array of data items to render</td>
                            </tr>
                            <tr>
                                <td><code>renderItem</code><span className="required">*</span></td>
                                <td>(item: T, index: number) =&gt; ReactNode</td>
                                <td>-</td>
                                <td>Render function for each item</td>
                            </tr>
                            <tr>
                                <td><code>getItemKey</code><span className="required">*</span></td>
                                <td>(item: T) =&gt; string</td>
                                <td>-</td>
                                <td>Unique key extractor for items</td>
                            </tr>
                            <tr>
                                <td><code>infinite</code></td>
                                <td>boolean</td>
                                <td>false</td>
                                <td>Enable infinite looping with teleportation</td>
                            </tr>
                            <tr>
                                <td><code>gap</code></td>
                                <td>number</td>
                                <td>16</td>
                                <td>Gap between items in pixels</td>
                            </tr>
                            <tr>
                                <td><code>snapType</code></td>
                                <td>'mandatory' | 'proximity' | 'none'</td>
                                <td>'mandatory'</td>
                                <td>CSS scroll-snap behavior</td>
                            </tr>
                            <tr>
                                <td><code>persistKey</code></td>
                                <td>string</td>
                                <td>-</td>
                                <td>Unique key to restore scroll position from session</td>
                            </tr>
                            <tr>
                                <td><code>initialIndex</code></td>
                                <td>number</td>
                                <td>-</td>
                                <td>Start at specific index (overrides persistence)</td>
                            </tr>
                            <tr>
                                <td><code>onActiveItemChange</code></td>
                                <td>(item: T) =&gt; void</td>
                                <td>-</td>
                                <td>Callback when the centered item updates</td>
                            </tr>
                            <tr>
                                <td><code>disableOpacityEffect</code></td>
                                <td>boolean</td>
                                <td>false</td>
                                <td>Disable transparency on non-centered items</td>
                            </tr>
                            <tr>
                                <td><code>disableScaleEffect</code></td>
                                <td>boolean</td>
                                <td>false</td>
                                <td>Disable shrinking on non-centered items</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="doc-card">
                    <h3>🎨 CSS & Responsive Widths</h3>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.6' }}>
                        Control item dimensions entirely through CSS variables. This allows you to use
                        media queries for fully responsive card sizing without JS re-renders.
                    </p>
                    <pre style={{
                        background: 'rgba(0,0,0,0.3)',
                        padding: '16px',
                        borderRadius: '8px',
                        overflowX: 'auto',
                        color: '#d1d5db',
                        fontSize: '0.875rem'
                    }}>
                        {`/* 1. Define your variable in CSS */
:root {
  --card-width: 220px;
}

@media (min-width: 768px) {
  :root { --card-width: 300px; }
}

/* 2. Pass it to the Carousel */
<Carousel
  itemWidthCssVar="--card-width"
  ...
/>`}
                    </pre>
                </div>
            </section>

            <footer className="footer">
                <p>
                    Built with ❤️ by Jorge Madrid Portillo | <a href="https://github.com/jorgemadridportillo/open-carousel">GitHub</a> | MIT License
                </p>
            </footer>
        </>
    )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
