import os
import uuid
import json
from flask import Flask, render_template, request, jsonify, send_from_directory, send_file
from werkzeug.utils import secure_filename
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import ConnectionPatch
import matplotlib.image as mpimg
import numpy as np
from io import BytesIO
import zipfile

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'input_images'
app.config['OUTPUT_FOLDER'] = 'output_images'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'bmp', 'tiff', 'tif'}

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_rect_corner(idx, x1, y1, x2, y2):
    return {0: (x1, y1), 1: (x2, y1), 2: (x2, y2), 3: (x1, y2)}[idx]


def get_inset_corner(idx):
    return {0: (0, 1), 1: (1, 1), 2: (1, 0), 3: (0, 0)}[idx]


def process_single_image(input_path, output_path, config):
    img = mpimg.imread(input_path)
    h, w = img.shape[:2]

    fig_w = 10
    fig_h = fig_w * (h / w)
    fig, ax = plt.subplots(figsize=(fig_w, fig_h))
    ax.imshow(img)
    ax.axis('off')

    zoom = config['zoom_ratios']
    x1, x2 = int(w * zoom[0]), int(w * zoom[1])
    y1, y2 = int(h * zoom[2]), int(h * zoom[3])

    inset_rect = config['inset_rect']
    axins = ax.inset_axes(inset_rect)
    axins.imshow(img)
    axins.set_xlim(x1, x2)
    axins.set_ylim(y2, y1)
    axins.set_xticks([])
    axins.set_yticks([])

    border_color = config.get('border_color', 'red')
    border_width = config.get('border_width', 2)
    for spine in axins.spines.values():
        spine.set_edgecolor(border_color)
        spine.set_linewidth(border_width)

    rect_color = config.get('rect_color', 'red')
    rect_width = config.get('rect_width', 2)
    rect = patches.Rectangle(
        (x1, y1), x2 - x1, y2 - y1,
        linewidth=rect_width, edgecolor=rect_color, facecolor='none')
    ax.add_patch(rect)

    line_color = config.get('line_color', 'red')
    line_width = config.get('line_width', 2)
    line_style = config.get('line_style', '--')
    lines = config.get('lines', [{'rect': 0, 'ins': 0}, {'rect': 3, 'ins': 3}])

    for line in lines:
        pt_rect = get_rect_corner(line['rect'], x1, y1, x2, y2)
        pt_inset = get_inset_corner(line['ins'])
        conn = ConnectionPatch(
            xyA=pt_rect, coordsA=ax.transData,
            xyB=pt_inset, coordsB=axins.transAxes,
            color=line_color, lw=line_width, linestyle=line_style)
        fig.add_artist(conn)

    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight', facecolor='black')
    plt.close(fig)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload():
    if 'files' not in request.files:
        return jsonify({'error': '没有选择文件'}), 400

    files = request.files.getlist('files')
    uploaded = []

    for f in files:
        if f and allowed_file(f.filename):
            filename = secure_filename(f.filename)
            if not filename:
                filename = f'{uuid.uuid4().hex[:8]}.png'
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            f.save(filepath)

            img = mpimg.imread(filepath)
            h, w = img.shape[:2]
            uploaded.append({
                'filename': filename,
                'width': w,
                'height': h,
                'url': f'/input_images/{filename}'
            })

    return jsonify({'files': uploaded})


@app.route('/preview', methods=['POST'])
def preview():
    data = request.get_json()
    filename = data['filename']
    config = data['config']

    input_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(input_path):
        return jsonify({'error': '文件不存在'}), 404

    preview_name = f'preview_{filename}'
    output_path = os.path.join(app.config['OUTPUT_FOLDER'], preview_name)
    process_single_image(input_path, output_path, config)

    return jsonify({'url': f'/output_images/{preview_name}', 'filename': preview_name})


@app.route('/batch', methods=['POST'])
def batch():
    data = request.get_json()
    config = data['config']
    filenames = data['filenames']

    results = []
    for filename in filenames:
        input_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if not os.path.exists(input_path):
            continue
        out_name = f'zoomed_{filename}'
        output_path = os.path.join(app.config['OUTPUT_FOLDER'], out_name)
        process_single_image(input_path, output_path, config)
        results.append({'filename': out_name, 'url': f'/output_images/{out_name}'})

    return jsonify({'results': results})


@app.route('/download_all', methods=['POST'])
def download_all():
    data = request.get_json()
    filenames = data.get('filenames', [])

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for name in filenames:
            filepath = os.path.join(app.config['OUTPUT_FOLDER'], name)
            if os.path.exists(filepath):
                zf.write(filepath, name)
    buffer.seek(0)
    return send_file(buffer, mimetype='application/zip',
                     as_attachment=True, download_name='zoomed_images.zip')


@app.route('/input_images/<filename>')
def serve_input(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


@app.route('/output_images/<filename>')
def serve_output(filename):
    return send_from_directory(app.config['OUTPUT_FOLDER'], filename)


if __name__ == '__main__':
    print("\n  Batch Zoom Tool Web UI")
    print("  打开浏览器访问: http://127.0.0.1:8080\n")
    app.run(debug=True, host='127.0.0.1', port=8080)