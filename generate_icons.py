#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont
import os

ICON_DIR = 'src/assets/icons'

# Create icons directory
os.makedirs(ICON_DIR, exist_ok=True)

def create_icon(size):
    # Create image with gradient background
    img = Image.new('RGB', (size, size), color='#667eea')
    draw = ImageDraw.Draw(img)
    
    # Draw a simple "K" for Kick
    # Calculate font size based on image size
    font_size = int(size * 0.7)
    
    # Draw circle background
    margin = int(size * 0.1)
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        fill='#764ba2'
    )
    
    # Draw "K" text
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except:
        font = ImageFont.load_default()
    
    # Get text bounding box to center it
    text = "K"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    x = (size - text_width) // 2
    y = (size - text_height) // 2
    
    draw.text((x, y), text, fill='white', font=font)
    
    return img

# Generate icons
for size in [16, 48, 128]:
    icon = create_icon(size)
    icon.save(f'{ICON_DIR}/icon{size}.png')
    print(f'Created icon{size}.png')

print('Icons generated successfully!')
