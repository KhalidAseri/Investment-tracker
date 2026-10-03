/**
 * Rasterises assets/icon.svg into the Android mipmap set.
 *
 * Android needs three variants per density: a square legacy icon, a circular
 * one for launchers that mask to a circle, and a transparent foreground layer
 * for adaptive icons (whose background comes from ic_launcher_background).
 *
 * Run with: node scripts/generate-android-icons.js
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const ROOT = path.join(__dirname, '..')
const RES = path.join(ROOT, 'android/app/src/main/res')

// Android's own baseline sizes for launcher icons, per density bucket.
const DENSITIES = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
}

// Adaptive icon layers are authored at 108dp; only the centre 72dp is
// guaranteed visible, which is why the foreground art is inset.
const ADAPTIVE_SCALE = 108 / 48

const square = fs.readFileSync(path.join(ROOT, 'assets/icon.svg'))
const foreground = fs.readFileSync(path.join(ROOT, 'assets/icon-foreground.svg'))

async function circleMask(size) {
  const r = size / 2
  return Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`
  )
}

async function main() {
  for (const [density, size] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, `mipmap-${density}`)
    fs.mkdirSync(dir, { recursive: true })

    await sharp(square, { density: 512 })
      .resize(size, size)
      .png()
      .toFile(path.join(dir, 'ic_launcher.png'))

    await sharp(square, { density: 512 })
      .resize(size, size)
      .composite([{ input: await circleMask(size), blend: 'dest-in' }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'))

    const adaptive = Math.round(size * ADAPTIVE_SCALE)
    await sharp(foreground, { density: 512 })
      .resize(adaptive, adaptive)
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'))

    console.log(`${density}: ${size}px legacy + ${adaptive}px adaptive foreground`)
  }

  // The adaptive background is a flat colour behind the foreground layer.
  fs.writeFileSync(
    path.join(RES, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#D97706</color>\n</resources>\n`
  )

  // Splash screen shown while the WebView boots.
  for (const [density, size] of Object.entries(DENSITIES)) {
    const splash = size * 4
    for (const orientation of ['port', 'land']) {
      const dir = path.join(RES, `drawable-${orientation}-${density}`)
      if (!fs.existsSync(dir)) continue
      await sharp({
        create: {
          width: orientation === 'port' ? splash : splash * 2,
          height: orientation === 'port' ? splash * 2 : splash,
          channels: 4,
          background: '#f9fafb',
        },
      })
        .composite([
          {
            input: await sharp(square, { density: 512 }).resize(splash / 2, splash / 2).png().toBuffer(),
            gravity: 'centre',
          },
        ])
        .png()
        .toFile(path.join(dir, 'splash.png'))
    }
  }

  console.log('icons + splash written')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
