# open-carousel

A high-performance, infinite-scroll React carousel with smooth animations, teleportation, and zero dependencies (except React).

## Features

- 🔄 **Infinite Scroll** - Seamless teleportation-based infinite scrolling
- 🎯 **CSS Snap Points** - Native scroll snapping for perfect alignment
- 🖱️ **Drag to Scroll** - Mouse and touch drag support with momentum
- ⌨️ **Arrow Navigation** - Accessible keyboard and button navigation
- 📏 **Responsive** - CSS variable-based responsive widths
- 🎨 **Visual Effects** - Scale, opacity, and shadow effects based on position
- 💾 **Persistence** - Optional scroll position persistence across navigation
- 🐛 **Debug Tools** - Built-in logging system for development

## Installation

```bash
npm install open-carousel
```

## Quick Start

```tsx
import { Carousel } from 'open-carousel'
import 'open-carousel/styles.css'

const items = [
  { id: '1', title: 'First Item' },
  { id: '2', title: 'Second Item' },
  { id: '3', title: 'Third Item' },
]

function MyCarousel() {
  return (
    <Carousel
      items={items}
      getItemKey={(item) => item.id}
      renderItem={(item) => (
        <div className="card">
          <h3>{item.title}</h3>
        </div>
      )}
      infinite
    />
  )
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `items` | `T[]` | required | Array of items to display |
| `getItemKey` | `(item: T, index: number) => string` | required | Unique key extractor |
| `renderItem` | `(item: T, index: number, helpers) => ReactNode` | required | Item renderer |
| `infinite` | `boolean` | `false` | Enable infinite scrolling |
| `itemWidthCssVar` | `string` | - | **Recommended**: Custom CSS variable for width |
| `itemWidthVar` | `'default' \| 'review' \| ...` | `'default'` | Legacy: Predefined width variant |
| `initialIndex` | `number` | `0` | Start at specific index |
| `gap` | `number` | auto | Gap between items in pixels |
| `snap` | `boolean` | `true` | Enable CSS scroll snapping |
| `snapType` | `'mandatory' \| 'proximity'` | `'mandatory'` | Snap behavior type |
| `disableOpacityEffect` | `boolean` | `false` | Disable opacity fade on edges |
| `disableScaleEffect` | `boolean` | `false` | Disable scale effect on edges |
| `verticalPadding` | `string` | `'20px'` | Vertical padding for container |
| `persistKey` | `string` | - | Key for scroll position persistence |
| `onActiveItemChange` | `(item: T) => void` | - | Callback when active item changes |
| `onEndReached` | `() => void` | - | Callback when scrolling to end |
| `hasNextPage` | `boolean` | `false` | Whether more items can be loaded |
| `prevLabel` | `string` | `'Previous'` | Aria label for previous button |
| `nextLabel` | `string` | `'Next'` | Aria label for next button |

## 📏 Responsive Item Widths (Recommended)
 
 The most flexible way to control item widths is using your own CSS variable and `itemWidthCssVar`.
 
 **1. Define Variable in CSS**
 ```css
 /* styles.css */
 :root {
   --my-card-width: 220px;
 }
 
 @media (min-width: 768px) {
   :root {
     --my-card-width: 300px;
   }
 }
 ```
 
 **2. Pass to Component**
 ```tsx
 <Carousel
   itemWidthCssVar="--my-card-width"
   items={items}
   // ...
 />
 ```

## Advanced Usage

### Custom Hooks

The package exports all internal hooks for advanced customization:

```tsx
import {
  useCarouselCoordinator,
  useCarouselLayout,
  useCarouselNavigation,
  useCarouselTeleport,
  useCarouselVisuals,
  useCarouselPersistence,
  useDraggableScroll,
} from 'open-carousel'
```

### Debugging

Enable debug logging for development:

```tsx
<Carousel
  items={items}
  debugId="my-carousel"
  debug={{ channels: { NAV: true, TELEPORT: true } }}
  // ...
/>
```

Or dump logs from the console:

```js
window.__DUMP_CAROUSEL_LOGS() // All logs
window.__DUMP_CAROUSEL_LOGS('my-carousel') // Specific carousel
```

## Browser Support

- Chrome 89+
- Firefox 90+
- Safari 15.4+
- Edge 89+

## License

MIT © 2025
