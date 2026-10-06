"""Draw docs/flow.svg and docs/flow.png: python docs/diagram.py (needs matplotlib)."""
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

OUT = Path(__file__).resolve().parent

LANES = {  # name -> (x, colour)
    "Student": (1.0, "#2563eb"),
    "Sign-up page\n(this Worker)": (4.2, "#16a34a"),
    "GitHub": (7.4, "#24292f"),
    "Grader": (10.2, "#9333ea"),
}
X = {k.split("\n")[0]: v[0] for k, v in LANES.items()}

PHASES = [  # (title, first step y, last step y)
    ("1  Join the organization", 1.6, 6.9),
    ("2  Create the project repo", 7.6, 9.9),
    ("3  Grade", 10.6, 11.2),
]

STEPS = [  # (from, to, label, y); from == to draws a check on that lane
    ("Student", "Sign-up page", "Click “Connect GitHub”", 2.0),
    ("Sign-up page", "GitHub", "Send student to GitHub sign-in", 2.9),
    ("GitHub", "Sign-up page", "Username + verified email addresses", 3.8),
    ("Sign-up page", "Sign-up page", "Email on the student list?", 4.75),
    ("Sign-up page", "GitHub", "Invite to org + cohort team", 5.7),
    ("GitHub", "Student", "Invite email", 6.6),
    ("Student", "GitHub", "Accept invite, create repo in the org", 8.0),
    ("GitHub", "Sign-up page", "Webhook: new repository", 8.9),
    ("Sign-up page", "GitHub", "Make repo private, add graders (read)", 9.8),
    ("Grader", "GitHub", "Open repos with own account", 11.0),
]


def main() -> None:
    fig, ax = plt.subplots(figsize=(11.5, 9.2))
    ax.set_xlim(-0.2, 11.4)
    ax.set_ylim(12.0, -0.3)
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
        ax.plot([x, x], [0.85, 11.6], color="#afb8c1", lw=1.2, ls=(0, (4, 4)), zorder=1)

    for n, (src, dst, label, y) in enumerate(STEPS, 1):
        if src == dst:
            x = X[src]
            ax.add_patch(FancyBboxPatch((x - 1.3, y - 0.3), 2.6, 0.6, boxstyle="round,pad=0,rounding_size=0.08",
                                        fc="#dcfce7", ec="#16a34a", lw=1.2, zorder=3))
            ax.text(x, y, f"{n}.  {label}", ha="center", va="center", fontsize=10, zorder=4)
            note = dict(fc="#f6f8fa", ec="none", pad=1)
            ax.text(x + 1.45, y - 0.12, "yes → continue", fontsize=9, color="#16a34a", va="center", zorder=4, bbox=note)
            ax.text(x + 1.45, y + 0.2, "no → “add your email in GitHub settings”", fontsize=9,
                    color="#cf222e", va="center", zorder=4, bbox=note)
            continue
        x1, x2 = X[src], X[dst]
        ax.annotate("", xy=(x2, y), xytext=(x1, y), zorder=3,
                    arrowprops=dict(arrowstyle="-|>", color="#24292f", lw=1.4, mutation_scale=16,
                                    shrinkA=4, shrinkB=4))
        mid = (x1 + x2) / 2
        ax.text(mid, y - 0.17, f"{n}.  {label}", ha="center", va="bottom", fontsize=10, zorder=4,
                bbox=dict(fc="white", ec="none", pad=1.5))

    ax.text(5.6, 11.85, "Nobody shares a login. Graders use their own GitHub accounts in the “graders” team.",
            ha="center", fontsize=9.5, color="#57606a", style="italic")

    fig.tight_layout(pad=0.3)
    fig.savefig(OUT / "flow.svg", facecolor="white")
    fig.savefig(OUT / "flow.png", dpi=160, facecolor="white")



if __name__ == "__main__":
    main()
