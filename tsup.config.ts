import { defineConfig } from 'tsup'

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    external: ['react', 'react-dom'],
    // Copy CSS to dist
    onSuccess: async () => {
        const fs = await import('fs/promises')
        try {
            await fs.copyFile('src/styles/carousel.css', 'dist/styles.css')
            console.log('CSS copied successfully')
        } catch (e) {
            console.error('Failed to copy CSS:', e)
        }
    },
})
