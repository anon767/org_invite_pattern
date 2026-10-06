"""Draw docs/how-it-works.svg and docs/how-it-works.png: python docs/diagram.py (needs matplotlib)."""
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

OUT = Path(__file__).resolve().parent

LANES = {  # name -> (x, colour)
    "Student": (1.0, "#2563eb"),
    "GitHub Actions\n(join repo)": (4.2, "#16a34a"),
    "GitHub": (7.4, "#24292f"),
    "Grader": (10.2, "#9333ea"),
}
X = {k.split("\n")[0]: v[0] for k, v in LANES.items()}

PHASES = [  # (title, first step y, last step y)
    ("1  Join the organization", 1.6, 5.0),
    ("2  Create the project repo", 5.7, 7.3),
    ("3  Grade", 8.0, 8.6),
]

STEPS = [  # (from, to, label, y)
    ("Student", "GitHub", "Open the “Request access” link, click Create", 2.0),
    ("GitHub", "GitHub Actions", "Issue opened by the student", 2.9),
    ("GitHub Actions", "GitHub", "Invite to org + students team, close issue", 3.8),
    ("GitHub", "Student", "Invite email", 4.7),
    ("Student", "GitHub", "Accept invite, create repo in the org", 6.1),
    ("GitHub Actions", "GitHub", "Every 10 min: make private, add graders (read)", 7.0),
    ("Grader", "GitHub", "Open repos with own account", 8.4),
]


def main() -> None:
    fig, ax = plt.subplots(figsize=(11.5, 7.2))
    ax.set_xlim(-0.2, 11.4)
    ax.set_ylim(9.4, -0.3)
    ax.axis("off")
    fig.patch.set_facecolor("white")

    for title, top, bottom in PHASES:
        ax.add_patch(FancyBboxPatch((0.05, top - 0.35), 11.1, bottom - top + 0.65,
                                    boxstyle="round,pad=0,rounding_size=0.12",
                                    fc="#f6f8fa", ec="#d0d7de", lw=1, zorder=0))
        ax.text(0.2, top - 0.17, title, fontsize=10.5, weight="bold", color="#57606a", va="center", zorder=4,
                bbox=dict(fc="#f6f8fa", ec="none", pad=1))

    for name, (x, colour) in LANES.items():
        ax.add_patch(FancyBboxPatch((x - 0.85, 0.0), 1.7, 0.85, boxstyle="round,pad=0,rounding_size=0.1",
                                    fc=colour, ec="none", zorder=3))
        ax.text(x, 0.42, name, ha="center", va="center", color="white", fontsize=11, weight="bold",
                linespacing=1.1, zorder=4)
        ax.plot([x, x], [0.85, 9.0], color="#afb8c1", lw=1.2, ls=(0, (4, 4)), zorder=1)

    for n, (src, dst, label, y) in enumerate(STEPS, 1):
        x1, x2 = X[src], X[dst]
        ax.annotate("", xy=(x2, y), xytext=(x1, y), zorder=3,
                    arrowprops=dict(arrowstyle="-|>", color="#24292f", lw=1.4, mutation_scale=16,
                                    shrinkA=4, shrinkB=4))
        mid = (x1 + x2) / 2
        ax.text(mid, y - 0.17, f"{n}.  {label}", ha="center", va="bottom", fontsize=10, zorder=4,
                bbox=dict(fc="white", ec="none", pad=1.5))

    ax.text(5.6, 9.25, "Nobody shares a login. Graders use their own GitHub accounts in the “graders” team.",
            ha="center", fontsize=9.5, color="#57606a", style="italic")

    fig.tight_layout(pad=0.3)
    fig.savefig(OUT / "how-it-works.svg", facecolor="white")
    fig.savefig(OUT / "how-it-works.png", dpi=160, facecolor="white")



if __name__ == "__main__":
    main()
