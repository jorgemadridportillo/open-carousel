import React from 'react'
import { createRoot } from 'react-dom/client'
import { Carousel } from '../src'
import './styles.css'

// Demo card data
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

            <h2 className="section-title">✨ Features</h2>

            <Carousel
                items={demoItems}
                getItemKey={(item) => item.id}
                renderItem={(item) => <DemoCard item={item} />}
                infinite
                gap={20}
                verticalPadding="40px"
                snapType="mandatory"
                debugId="demo-carousel"
                initialIndex={0}
                debug={{ channels: 'ALL' }}
            />

            <footer className="footer">
                <p>
                    Built with ❤️ | <a href="https://github.com/your-username/open-carousel">GitHub</a> | MIT License
                </p>
            </footer>
        </>
    )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
