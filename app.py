from __future__ import annotations

import os
from flask import Flask, flash, redirect, render_template, request, url_for
from werkzeug.utils import secure_filename

ALLOWED_EXTENSIONS = {"pdf"}
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")

app = Flask(__name__)
app.config["SECRET_KEY"] = "dev"
app.config["UPLOAD_FOLDER"] = UPLOAD_DIR
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024


def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route("/")
def chat() -> str:
    return render_template("chat.html")


@app.route("/dashboard")
def dashboard() -> str:
    return render_template("dashboard.html")


@app.route("/upload", methods=["POST"])
def upload_pdf():
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    file = request.files.get("project_pdf")
    if not file or file.filename == "":
        flash("Select a PDF with the project description.")
        return redirect(url_for("chat"))

    if not _allowed_file(file.filename):
        flash("Only PDF files are supported.")
        return redirect(url_for("chat"))

    filename = secure_filename(file.filename)
    file.save(os.path.join(app.config["UPLOAD_FOLDER"], filename))
    flash("PDF uploaded. The agent is ready to analyze it.")
    return redirect(url_for("chat"))


if __name__ == "__main__":
    app.run(debug=True)
