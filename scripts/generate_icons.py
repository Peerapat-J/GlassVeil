# generate_icons.py
import os
import sys

# Ensure icons directory exists
os.makedirs('icons', exist_ok=True)

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Pillow is not installed. Installing it via pip...")
    import subprocess
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
        from PIL import Image, ImageDraw
    except Exception as e:
        print(f"Failed to install Pillow: {e}")
        print("Please install Pillow manually: pip install Pillow")
        sys.exit(1)

def draw_icon(size):
    # Create an image with transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Coordinates
    margin = max(1, size // 16)
    width = size - 2 * margin
    
    # Draw a rounded base/shield (violet/blue gradient proxy or color)
    # Background color is royal violet: #6c5ce7
    fill_color = (108, 92, 231, 255)
    r = size // 4
    
    # Outer rounded rect
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=r,
        fill=fill_color
    )
    
    # Draw a glassmorphic look: a light glowing arc or accent
    accent_margin = margin + max(1, size // 8)
    accent_width = size - 2 * accent_margin
    # Neon cyan: #00cec9 (100% opacity for center circle or shield accent)
    draw.ellipse(
        [accent_margin, accent_margin, size - accent_margin, size - accent_margin],
        fill=(0, 206, 201, 255)
    )
    
    # Draw a letter 'G' in the middle
    # Use standard white font (text anchor)
    # We will use simple lines to draw a 'G' if font loading fails, or just draw basic text
    font_size = size // 2
    # To be safe and avoid font dependency issues, we can draw a beautiful geometric 'G' or shield using lines
    # Let's draw a white shield path
    # Shield points: top-left, top-right, bottom-middle, left-indent
    cx = size // 2
    cy = size // 2
    w = size // 5
    
    # Let's draw an inner white shield
    shield_pts = [
        (cx - w, cy - w),
        (cx + w, cy - w),
        (cx + w, cy),
        (cx, cy + w + w//2),
        (cx - w, cy)
    ]
    draw.polygon(shield_pts, fill=(255, 255, 255, 255))
    
    # Draw an inner transparent cutout for shield depth
    inner_pts = [
        (cx - w + 2, cy - w + 2),
        (cx + w - 2, cy - w + 2),
        (cx + w - 2, cy),
        (cx, cy + w + w//2 - 2),
        (cx - w + 2, cy)
    ]
    draw.polygon(inner_pts, fill=(0, 206, 201, 255))
    
    img.save(f'icons/icon-{size}.png')
    print(f'Created icons/icon-{size}.png ({size}x{size})')

for s in [16, 48, 128]:
    draw_icon(s)

print("Icons generated successfully!")
