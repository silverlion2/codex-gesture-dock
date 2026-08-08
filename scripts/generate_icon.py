"""Generate the deterministic Codex Gesture Dock Windows icon."""

from pathlib import Path

from PIL import Image, ImageDraw


SIZE = 1024
OUTPUT = Path(__file__).resolve().parents[1] / "build" / "icon.png"


def main() -> None:
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle(
        (48, 48, 976, 976),
        radius=232,
        fill="#126D4B",
    )

    white = "#FFFFFF"
    stroke = 58
    draw.rounded_rectangle(
        (214, 360, 810, 754),
        radius=104,
        outline=white,
        width=stroke,
    )
    draw.rounded_rectangle(
        (334, 280, 526, 404),
        radius=54,
        fill=white,
    )
    draw.ellipse((384, 444, 640, 700), outline=white, width=stroke)
    draw.ellipse((468, 528, 556, 616), fill=white)

    draw.arc((612, 150, 866, 404), start=205, end=320, fill=white, width=48)
    draw.arc((674, 214, 830, 370), start=205, end=320, fill=white, width=42)
    draw.ellipse((730, 286, 788, 344), fill=white)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT, "PNG", optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()
