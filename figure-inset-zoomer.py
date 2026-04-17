import os
import glob
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import ConnectionPatch
import matplotlib.image as mpimg
import numpy as np

# ╔══════════════════════════════════════════════════════════════╗
# ║  运行模式 (三步工作流)                                       ║
# ║                                                              ║
# ║  "grid"   → 第1步: 生成网格参考图，确定缩放区域比例          ║
# ║  "debug"  → 第2步: 显示角点编号 R0~R3 / I0~I3，调连接线     ║
# ║  "final"  → 第3步: 正式出图，干净无标注                      ║
# ╚══════════════════════════════════════════════════════════════╝
MODE = "debug"

INPUT_DIR  = "input_images"
OUTPUT_DIR = "output_images"

# ╔══════════════════════════════════════════════════════════════╗
# ║  缩放区域比例 (在 grid 参考图上读取)                         ║
# ║                                                              ║
# ║  ZOOM_RATIOS = (x最小, x最大, y最小, y最大)                 ║
# ║  范围 0.0 ~ 1.0，对应图片宽高的百分比                       ║
# ║                                                              ║
# ║  grid 参考图上:                                              ║
# ║    绿色数字 = X 方向比例 (水平，从左到右)                    ║
# ║    青色数字 = Y 方向比例 (垂直，从上到下)                    ║
# ║    红色半透明框 = 当前 ZOOM_RATIOS 的预览                    ║
# ╚══════════════════════════════════════════════════════════════╝
ZOOM_RATIOS = (0.20, 0.38, 0.25, 0.46)

# ╔══════════════════════════════════════════════════════════════╗
# ║  放大镜位置和大小                                            ║
# ║  INSET_RECT = [左边距, 下边距, 宽度, 高度]  (0.0 ~ 1.0)    ║
# ║                                                              ║
# ║  ┌───────────────────────────────┐                           ║
# ║  │ (0,1)                   (1,1)│                           ║
# ║  │                              │                           ║
# ║  │         ┌─────────┐         │                           ║
# ║  │         │ 放大镜   │ height  │                           ║
# ║  │         └─────────┘         │                           ║
# ║  │         ↑left  ↔width       │                           ║
# ║  │         ↑bottom              │                           ║
# ║  │ (0,0)                   (1,0)│                           ║
# ║  └───────────────────────────────┘                           ║
# ║                                                              ║
# ║  常用位置:                                                   ║
# ║  右上 [0.58, 0.55, 0.40, 0.40]                              ║
# ║  左上 [0.02, 0.55, 0.40, 0.40]                              ║
# ║  右下 [0.58, 0.02, 0.40, 0.40]                              ║
# ║  左下 [0.02, 0.02, 0.40, 0.40]                              ║
# ╚══════════════════════════════════════════════════════════════╝
INSET_RECT = [0.58, 0.45, 0.40, 0.40]

# ╔══════════════════════════════════════════════════════════════╗
# ║  连接线角点配置 (在 debug 模式确认编号)                      ║
# ║                                                              ║
# ║       0 ──────── 1                                           ║
# ║       │          │                                           ║
# ║       3 ──────── 2                                           ║
# ║                                                              ║
# ║  0=左上  1=右上  2=右下  3=左下                              ║
# ║  缩放框和放大镜用同一套编号                                  ║
# ╚══════════════════════════════════════════════════════════════╝
LINE1_RECT = 0;  LINE1_INS = 0   # 缩放框左上 → 放大镜左上
LINE2_RECT = 3;  LINE2_INS = 3   # 缩放框左下 → 放大镜左下

# 样式
LINE_COLOR   = 'red'
LINE_WIDTH   = 2
LINE_STYLE   = '--'
RECT_COLOR   = 'red'
RECT_WIDTH   = 2
BORDER_COLOR = 'red'
BORDER_WIDTH = 2


# ══════════════════════════════════════════════════════════════
#  以下为功能代码，一般不需要修改
# ══════════════════════════════════════════════════════════════

def get_rect_corner(idx, x1, y1, x2, y2):
    return {0:(x1,y1), 1:(x2,y1), 2:(x2,y2), 3:(x1,y2)}[idx]

def get_inset_corner(idx):
    return {0:(0,1), 1:(1,1), 2:(1,0), 3:(0,0)}[idx]


def generate_grid(input_path, output_path):
    """第1步: 生成带网格+坐标的参考图"""
    img = mpimg.imread(input_path)
    h, w = img.shape[:2]

    fig_w = 12
    fig_h = fig_w * (h / w)
    fig, ax = plt.subplots(figsize=(fig_w, fig_h))
    ax.imshow(img)

    # 10% 间隔网格
    for ratio in np.arange(0.0, 1.01, 0.1):
        px = int(w * ratio)
        py = int(h * ratio)
        ax.axvline(x=px, color='lime', linewidth=0.8, alpha=0.7)
        ax.axhline(y=py, color='lime', linewidth=0.8, alpha=0.7)
        if ratio < 1.0:
            ax.text(px + w*0.005, h*0.02, f'{ratio:.1f}',
                    fontsize=9, color='lime', fontweight='bold',
                    bbox=dict(boxstyle='round,pad=0.15', fc='black', alpha=0.7))
            ax.text(w*0.005, py + h*0.005, f'{ratio:.1f}',
                    fontsize=9, color='cyan', fontweight='bold', va='top',
                    bbox=dict(boxstyle='round,pad=0.15', fc='black', alpha=0.7))

    # 当前 ZOOM_RATIOS 预览框
    rx_min, rx_max, ry_min, ry_max = ZOOM_RATIOS
    x1, x2 = int(w * rx_min), int(w * rx_max)
    y1, y2 = int(h * ry_min), int(h * ry_max)
    rect = patches.Rectangle(
        (x1, y1), x2-x1, y2-y1,
        linewidth=3, edgecolor='red', facecolor='red', alpha=0.2
    )
    ax.add_patch(rect)
    ax.text((x1+x2)/2, y1 - h*0.02,
            f'ZOOM: x({rx_min:.2f}~{rx_max:.2f}) y({ry_min:.2f}~{ry_max:.2f})',
            fontsize=11, color='red', fontweight='bold', ha='center', va='bottom',
            bbox=dict(boxstyle='round,pad=0.3', fc='black', alpha=0.85))

    ax.set_title(
        f'{os.path.basename(input_path)}  |  {w}x{h} px\n'
        f'Green=X ratio   Cyan=Y ratio   Red=ZOOM_RATIOS preview',
        fontsize=11, color='white', pad=10,
        bbox=dict(boxstyle='round', fc='black', alpha=0.8))
    ax.axis('off')

    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches='tight', facecolor='black')
    plt.close(fig)
    print(f"  Saved: {output_path}")


def process_image(input_path, output_path, debug=False):
    """第2/3步: 生成放大图"""
    img = mpimg.imread(input_path)
    h, w = img.shape[:2]

    fig_w = 10
    fig_h = fig_w * (h / w)
    fig, ax = plt.subplots(figsize=(fig_w, fig_h))
    ax.imshow(img)
    ax.axis('off')

    rx_min, rx_max, ry_min, ry_max = ZOOM_RATIOS
    x1, x2 = int(w * rx_min), int(w * rx_max)
    y1, y2 = int(h * ry_min), int(h * ry_max)

    # 放大镜
    axins = ax.inset_axes(INSET_RECT)
    axins.imshow(img)
    axins.set_xlim(x1, x2)
    axins.set_ylim(y2, y1)
    axins.set_xticks([])
    axins.set_yticks([])
    for spine in axins.spines.values():
        spine.set_edgecolor(BORDER_COLOR)
        spine.set_linewidth(BORDER_WIDTH)

    # 缩放框
    rect = patches.Rectangle(
        (x1, y1), x2-x1, y2-y1,
        linewidth=RECT_WIDTH, edgecolor=RECT_COLOR,
        facecolor='none', linestyle='-'
    )
    ax.add_patch(rect)

    # 调试标注
    if debug:
        offset = max((x2-x1), (y2-y1)) * 0.08
        r_pos = {
            0: (x1+offset, y1+offset),
            1: (x2-offset, y1+offset),
            2: (x2-offset, y2-offset),
            3: (x1+offset, y2-offset),
        }
        for i, (rx, ry) in r_pos.items():
            ax.text(rx, ry, f'R{i}', fontsize=16, color='yellow',
                    fontweight='bold', ha='center', va='center',
                    bbox=dict(boxstyle='round,pad=0.2', fc='black', alpha=0.85))
        i_pos = {
            0: (0.08, 0.92),
            1: (0.92, 0.92),
            2: (0.92, 0.08),
            3: (0.08, 0.08),
        }
        for i, (ix, iy) in i_pos.items():
            axins.text(ix, iy, f'I{i}', transform=axins.transAxes,
                       fontsize=16, color='cyan', fontweight='bold',
                       ha='center', va='center',
                       bbox=dict(boxstyle='round,pad=0.2', fc='black', alpha=0.85))

    # 连接线
    for (r_idx, i_idx) in [(LINE1_RECT, LINE1_INS), (LINE2_RECT, LINE2_INS)]:
        pt_rect  = get_rect_corner(r_idx, x1, y1, x2, y2)
        pt_inset = get_inset_corner(i_idx)
        conn = ConnectionPatch(
            xyA=pt_rect,  coordsA=ax.transData,
            xyB=pt_inset, coordsB=axins.transAxes,
            color=LINE_COLOR, lw=LINE_WIDTH, linestyle=LINE_STYLE
        )
        fig.add_artist(conn)

    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight', facecolor='black')
    plt.close(fig)
    print(f"  Saved: {output_path}")


def batch_process():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    image_files = sorted(glob.glob(os.path.join(INPUT_DIR, '*.png')))

    if not image_files:
        print(f"No PNG images found in {INPUT_DIR}.")
        return

    for img_path in image_files:
        filename = os.path.basename(img_path)

        if MODE == "grid":
            out_path = os.path.join(OUTPUT_DIR, f"grid_{filename}")
            print(f"[GRID] {filename} ...")
            generate_grid(img_path, out_path)

        elif MODE == "debug":
            out_path = os.path.join(OUTPUT_DIR, f"debug_{filename}")
            print(f"[DEBUG] {filename} ...")
            process_image(img_path, out_path, debug=True)

        elif MODE == "final":
            out_path = os.path.join(OUTPUT_DIR, f"zoomed_{filename}")
            print(f"[FINAL] {filename} ...")
            process_image(img_path, out_path, debug=False)

        else:
            print(f"Unknown MODE: {MODE}")
            return

    # 提示下一步
    print(f"\nDone! {len(image_files)} images saved to {OUTPUT_DIR}\n")
    if MODE == "grid":
        print("═" * 55)
        print("  下一步操作:")
        print("  1. 打开 output_images/grid_xxx.png")
        print("  2. 看网格读取缩放区域的比例值")
        print("  3. 修改 ZOOM_RATIOS = (x最小, x最大, y最小, y最大)")
        print("  4. 改 MODE = \"debug\"")
        print("  5. 重新运行 python batch_zoom.py")
        print("═" * 55)
    elif MODE == "debug":
        print("═" * 55)
        print("  下一步操作:")
        print("  1. 打开 output_images/debug_xxx.png")
        print("  2. 确认 R0~R3 和 I0~I3 的位置")
        print("  3. 修改 LINE1_RECT/LINE1_INS 和 LINE2_RECT/LINE2_INS")
        print("  4. 改 MODE = \"final\"")
        print("  5. 重新运行 python batch_zoom.py")
        print("═" * 55)
    elif MODE == "final":
        print("═" * 55)
        print("  全部完成！最终图片已保存。")
        print("═" * 55)


if __name__ == "__main__":
    batch_process()
