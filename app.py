"""
============================================================
SECURECAM - MAIN BACKEND SERVER (app.py)
============================================================
"""

from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    session,
    redirect,
    send_file,
    send_from_directory,
)
from flask_socketio import SocketIO, emit, join_room
import os
import time
from datetime import datetime, timedelta

from database import (
    add_user,
    get_user,
    init_db,
    save_inquiry,
    save_feedback,
    get_user_by_id,
    update_user,
    delete_user,
    save_video,
    save_photo,
    save_motion,
    get_user_videos,
    get_user_photos,
    get_video_by_seq_and_user,
    get_photo_by_seq_and_user,
    delete_video_record_by_user,
    delete_photo_record_by_user,
    save_viewer_alarm,
    save_camera_cover,
    save_human_detection,
    get_latest_session_id,
    get_connection,
    save_camera_session,
    mark_camera_session_ended,
)


# ============================================================
# FLASK APPLICATION INITIALIZATION
# ============================================================

app = Flask(__name__)
app.secret_key = "securecam_secret"
app.permanent_session_lifetime = timedelta(days=7)

socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")
init_db()


# ============================================================
# GLOBAL VARIABLES
# ============================================================

viewer_count = {}
viewer_sequence = {}
viewer_rooms = {}

camera_rooms = {}  # camera socket sid -> room
camera_sessions = {}  # room -> {"session_id", "start_time", "camera_sid", "camera_user_id"}


# ============================================================
# MEDIA STORAGE FOLDERS
# ============================================================

PHOTO_FOLDER = "photos"
RECORDING_FOLDER = "recordings"

os.makedirs(PHOTO_FOLDER, exist_ok=True)
os.makedirs(RECORDING_FOLDER, exist_ok=True)


# ============================================================
# HELPER FUNCTIONS
# ============================================================


def is_logged_in():
    return "user_id" in session


def build_video_url(file_path):
    filename = os.path.basename(file_path)
    return f"/recordings/{filename}"


def build_photo_url(file_path):
    filename = os.path.basename(file_path)
    return f"/photos/{filename}"


def create_session_id(room):
    return f"{room}_{int(time.time() * 1000)}"


def start_camera_session(room, camera_user_id=None, camera_sid=None):
    session_id = create_session_id(room)
    start_time = time.time()

    camera_sessions[room] = {
        "session_id": session_id,
        "start_time": start_time,
        "camera_sid": camera_sid,
        "camera_user_id": camera_user_id,
    }

    try:
        save_camera_session(room, session_id, camera_user_id)
    except Exception as e:
        print("Save camera session error:", e)

    return session_id


def get_active_room_session(room):
    return camera_sessions.get(room)


def get_current_or_latest_session_id(room):
    active = get_active_room_session(room)
    if active and active.get("session_id"):
        return active["session_id"]
    return get_latest_session_id(room)


def get_current_session_elapsed(room):
    active = get_active_room_session(room)
    if not active:
        return None

    start_time = active.get("start_time")
    if not start_time:
        return None

    return int(time.time() - start_time)


# ============================================================
# MEDIA FILE SERVING
# ============================================================


@app.route("/recordings/<path:filename>")
def serve_recording(filename):
    return send_from_directory(RECORDING_FOLDER, filename)


@app.route("/photos/<path:filename>")
def serve_photo(filename):
    return send_from_directory(PHOTO_FOLDER, filename)


# ============================================================
# ACCOUNT MANAGEMENT
# ============================================================


@app.route("/account")
def account():
    if not is_logged_in():
        return redirect("/login")
    return render_template("account.html")


@app.route("/account_data")
def account_data():
    if not is_logged_in():
        return jsonify({"error": "not logged in"}), 401

    user = get_user_by_id(session["user_id"])
    if not user:
        session.clear()
        return jsonify({"error": "user not found"}), 404

    return jsonify(
        {
            "id": user[0],
            "username": user[1],
            "password": user[2],
            "email": user[3],
            "phone": user[4],
            "dob": user[5],
        }
    )


@app.route("/update_account", methods=["POST"])
def update_account():
    if not is_logged_in():
        return "Login required", 401

    uid = session["user_id"]

    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")
    email = request.form.get("email", "").strip()
    phone = request.form.get("phone", "").strip()
    dob = request.form.get("dob", "").strip()

    user = get_user_by_id(uid)
    if not user:
        session.clear()
        return "User not found"

    if not username or not email or not phone or not dob:
        return "All fields are required"

    old_password = user[2]
    password_changed = password != old_password

    update_user(uid, username, password, email, phone, dob)
    session["username"] = username

    if password_changed:
        session.clear()
        return "Password changed. Please login again"

    return "Account updated successfully"


@app.route("/delete_account", methods=["POST"])
def delete_account():
    if not is_logged_in():
        return "Login required", 401

    uid = session["user_id"]
    delete_user(uid)
    session.clear()

    return "Account deleted"


# ============================================================
# PAGE ROUTES
# ============================================================


@app.route("/")
def home():
    return render_template("index.html", logged_in=is_logged_in())


@app.route("/about")
def about():
    return render_template("about.html")


@app.route("/feedback")
def feedback():
    return render_template("feedback.html")


@app.route("/connect")
def connect():
    if not is_logged_in():
        return redirect("/login")
    return render_template("connect.html")


@app.route("/live")
def live():
    if not is_logged_in():
        return redirect("/login")
    return render_template("live.html", username=session.get("username"))


@app.route("/videos")
@app.route("/videos_page")
def videos_page():
    if not is_logged_in():
        return redirect("/login")
    return render_template("videos.html")


@app.route("/photos")
@app.route("/photos_page")
def photos_page():
    if not is_logged_in():
        return redirect("/login")
    return render_template("photos.html")


@app.route("/activity")
def activity():
    if not is_logged_in():
        return redirect("/login")
    return render_template("activity.html")


# ============================================================
# API: FETCH USER MEDIA LIST
# ============================================================


@app.route("/api/videos")
def api_videos():
    if not is_logged_in():
        return jsonify([]), 401

    uid = session["user_id"]
    rows = get_user_videos(uid)

    data = []
    for r in rows:
        data.append(
            {
                "seq": r["seq"],
                "path": build_video_url(r["file_path"]),
                "date": r["record_date"],
                "time": r["record_time"],
                "duration": r["duration_seconds"],
            }
        )

    return jsonify(data)


@app.route("/api/photos")
def api_photos():
    if not is_logged_in():
        return jsonify([]), 401

    uid = session["user_id"]
    rows = get_user_photos(uid)

    data = []
    for r in rows:
        data.append(
            {
                "seq": r["seq"],
                "path": build_photo_url(r["file_path"]),
                "date": r["capture_date"],
                "time": r["capture_time"],
            }
        )

    return jsonify(data)


# ============================================================
# DOWNLOAD MEDIA
# ============================================================


@app.route("/download/video/<int:seq>")
def download_video(seq):
    if not is_logged_in():
        return redirect("/login")

    uid = session["user_id"]
    row = get_video_by_seq_and_user(seq, uid)

    if not row:
        return "Not found", 404

    if not os.path.exists(row["file_path"]):
        return "File not found", 404

    return send_file(row["file_path"], as_attachment=True)


@app.route("/download/photo/<int:seq>")
def download_photo(seq):
    if not is_logged_in():
        return redirect("/login")

    uid = session["user_id"]
    row = get_photo_by_seq_and_user(seq, uid)

    if not row:
        return "Not found", 404

    if not os.path.exists(row["file_path"]):
        return "File not found", 404

    return send_file(row["file_path"], as_attachment=True)


# ============================================================
# DELETE MEDIA
# ============================================================


@app.route("/delete/video/<int:seq>", methods=["DELETE"])
def delete_video(seq):
    if not is_logged_in():
        return jsonify({"status": "error", "message": "login required"}), 401

    uid = session["user_id"]
    path = delete_video_record_by_user(seq, uid)

    if not path:
        return jsonify({"status": "error", "message": "not found"}), 404

    if os.path.exists(path):
        os.remove(path)

    return jsonify({"status": "deleted"})


@app.route("/delete/photo/<int:seq>", methods=["DELETE"])
def delete_photo(seq):
    if not is_logged_in():
        return jsonify({"status": "error", "message": "login required"}), 401

    uid = session["user_id"]
    path = delete_photo_record_by_user(seq, uid)

    if not path:
        return jsonify({"status": "error", "message": "not found"}), 404

    if os.path.exists(path):
        os.remove(path)

    return jsonify({"status": "deleted"})


# ============================================================
# USER AUTHENTICATION
# ============================================================


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if is_logged_in():
        return redirect("/connect")

    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        email = request.form.get("email")
        phone = request.form.get("phone")
        dob = request.form.get("dob")

        if not username or not password or not email or not phone or not dob:
            return "All fields are required"

        existing = get_user(username)
        if existing:
            return "Username already exists"

        add_user(username, password, email, phone, dob)
        return redirect("/login")

    return render_template("login.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if is_logged_in():
        return redirect("/connect")

    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")

        user = get_user(username)

        if user and user[2] == password:
            session.permanent = True
            session["user_id"] = user[0]
            session["username"] = user[1]
            return redirect("/connect")

        return "Invalid username or password"

    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/login")


# ============================================================
# MEDIA UPLOAD ROUTES
# ============================================================


@app.route("/upload_recording", methods=["POST"])
def upload_recording():
    if not is_logged_in():
        return jsonify({"status": "error", "message": "login required"}), 401

    file = request.files.get("video")
    camera_id = request.form.get("camera_id")
    duration = request.form.get("duration")

    if not file:
        return jsonify({"status": "error"}), 400

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"recording_{timestamp}.webm"
    path = os.path.join(RECORDING_FOLDER, filename)

    file.save(path)

    viewer_uid = session.get("user_id")
    if viewer_uid:
        save_video(path, viewer_uid, camera_id, duration)

    return jsonify({"status": "saved", "file": filename})


@app.route("/upload_photo", methods=["POST"])
def upload_photo():
    if not is_logged_in():
        return jsonify({"status": "error", "message": "login required"}), 401

    file = request.files.get("photo")
    camera_id = request.form.get("camera_id")

    if not file:
        return jsonify({"status": "error"}), 400

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"photo_{timestamp}.png"
    path = os.path.join(PHOTO_FOLDER, filename)

    file.save(path)

    viewer_uid = session.get("user_id")
    if viewer_uid:
        save_photo(path, viewer_uid, camera_id)

    return jsonify({"status": "saved", "file": filename})


# ============================================================
# SOCKET.IO EVENTS
# ============================================================


@socketio.on("join")
def handle_join(data):
    room = data.get("room")
    role = data.get("role")

    if not room or not role:
        return

    join_room(room)

    if room not in viewer_count:
        viewer_count[room] = 0

    if room not in viewer_sequence:
        viewer_sequence[room] = 0

    if role == "camera":
        camera_user_id = session.get("user_id")
        camera_rooms[request.sid] = room

        # start a fresh session when camera joins or rejoins
        start_camera_session(
            room, camera_user_id=camera_user_id, camera_sid=request.sid
        )

    elif role == "viewer":
        viewer_count[room] += 1
        viewer_rooms[request.sid] = room

        viewer_sequence[room] += 1
        viewer_number = viewer_sequence[room]

        emit("viewer_number", {"number": viewer_number}, room=request.sid)

        emit(
            "viewer_joined",
            {
                "sid": request.sid,
                "count": viewer_count[room],
                "username": session.get("username", "Viewer"),
            },
            room=room,
            skip_sid=request.sid,
        )


@socketio.on("viewer_ready")
def viewer_ready(data):
    room = data.get("room")
    if not room:
        return

    emit("viewer_ready", {"room": room, "sid": request.sid}, room=room)


@socketio.on("offer")
def handle_offer(data):
    emit(
        "offer",
        {"offer": data["offer"], "sid": request.sid, "room": data["room"]},
        room=data["target"],
    )


@socketio.on("answer")
def handle_answer(data):
    emit("answer", {"answer": data["answer"], "sid": request.sid}, room=data["target"])


@socketio.on("candidate")
def handle_candidate(data):
    emit(
        "candidate",
        {"candidate": data["candidate"], "sid": request.sid},
        room=data["target"],
    )


@socketio.on("chat_message")
def handle_chat_message(data):
    target = data.get("target")
    if not target:
        return

    emit(
        "chat_message",
        {"sender": data.get("sender"), "message": data.get("message")},
        room=target,
    )


@socketio.on("camera_location")
def handle_camera_location(data):
    room = data.get("room")
    if not room:
        return

    emit(
        "camera_location",
        {"lat": data.get("lat"), "lng": data.get("lng"), "source": data.get("source")},
        room=room,
        skip_sid=request.sid,
    )


@socketio.on("camera_cover_event")
def handle_camera_cover(data):
    room = data.get("room")
    if not room:
        return

    active = get_active_room_session(room)
    if not active:
        start_camera_session(
            room, camera_user_id=session.get("user_id"), camera_sid=request.sid
        )
        active = get_active_room_session(room)

    session_id = active["session_id"]

    time_sec = data.get("time")
    if time_sec is None:
        time_sec = get_current_session_elapsed(room)
    if time_sec is None:
        time_sec = 0

    try:
        save_camera_cover(room, session_id, int(time_sec))
    except Exception as e:
        print("Camera cover DB error:", e)


@socketio.on("manual_alarm")
def handle_manual_alarm(data):
    room = data.get("room")
    if not room:
        return

    emit("manual_alarm", {"room": room}, room=room)

    active = get_active_room_session(room)
    if not active:
        return

    viewer_id = session.get("user_id")
    if not viewer_id:
        return

    time_sec = get_current_session_elapsed(room)
    if time_sec is None:
        time_sec = 0

    try:
        save_viewer_alarm(viewer_id, room, active["session_id"], int(time_sec))
    except Exception as e:
        print("Alarm DB error:", e)


@socketio.on("motion_event")
def handle_motion_event(data):
    room = data.get("room")
    motion = data.get("motion", 0)
    time_sec = data.get("time", 0)

    if not room:
        return

    active = get_active_room_session(room)
    if not active:
        start_camera_session(
            room, camera_user_id=session.get("user_id"), camera_sid=request.sid
        )
        active = get_active_room_session(room)

    try:
        save_motion(room, active["session_id"], int(time_sec), int(motion))
    except Exception as e:
        print("Motion event DB error:", e)


@socketio.on("disconnect")
def handle_disconnect():
    sid = request.sid

    if sid in viewer_rooms:
        room = viewer_rooms[sid]

        if room in viewer_count and viewer_count[room] > 0:
            viewer_count[room] -= 1

        emit("viewer_left", {"sid": sid, "count": viewer_count.get(room, 0)}, room=room)

        del viewer_rooms[sid]

    if sid in camera_rooms:
        room = camera_rooms[sid]
        active = camera_sessions.get(room)

        if active and active.get("camera_sid") == sid:
            try:
                mark_camera_session_ended(active["session_id"])
            except Exception as e:
                print("Mark camera session ended error:", e)

            del camera_sessions[room]

        del camera_rooms[sid]


@socketio.on("human_detected")
def handle_human_detected(data):
    room = data.get("room")
    if not room:
        return

    active = get_active_room_session(room)
    if not active:
        start_camera_session(
            room, camera_user_id=session.get("user_id"), camera_sid=request.sid
        )
        active = get_active_room_session(room)

    if active:
        session_id = active["session_id"]
        time_sec = data.get("time", 0)
        person_count = data.get("count", 1)

        try:
            save_human_detection(room, session_id, int(time_sec), int(person_count))
        except Exception as e:
            print("Human detection DB error:", e)

    emit(
        "human_detected",
        {"room": room, "time": data.get("time", 0), "count": data.get("count", 1)},
        room=room,
        skip_sid=request.sid,
    )


# ============================================================
# ACTIVITY REPORT ROUTES
# ============================================================


@app.route("/api/activity/motion")
def api_activity_motion():
    if not is_logged_in():
        return jsonify([]), 401

    room = request.args.get("camera")
    if not room:
        return jsonify([])

    try:
        session_id = get_current_or_latest_session_id(room)
        if not session_id:
            return jsonify([])

        conn = get_connection()
        c = conn.cursor()

        c.execute(
            """
            SELECT time_sec, motion_count
            FROM motion_events
            WHERE camera_room_id=? AND session_id=?
            ORDER BY time_sec DESC
            LIMIT 50
        """,
            (room, session_id),
        )

        rows = c.fetchall()[::-1]
        conn.close()

        data = []
        for r in rows:
            data.append({"time": r["time_sec"], "motion": r["motion_count"]})

        return jsonify(data)

    except Exception as e:
        print("Motion API Error:", e)
        return jsonify([])


@app.route("/api/activity/alarms")
def api_activity_alarms():
    if not is_logged_in():
        return jsonify({"viewer_alarm_times": [], "camera_cover_times": []}), 401

    room = request.args.get("camera")
    if not room:
        return jsonify({"viewer_alarm_times": [], "camera_cover_times": []})

    try:
        session_id = get_current_or_latest_session_id(room)
        if not session_id:
            return jsonify({"viewer_alarm_times": [], "camera_cover_times": []})

        conn = get_connection()
        c = conn.cursor()

        c.execute(
            """
            SELECT time_sec
            FROM viewer_alarm_events
            WHERE camera_room_id=? AND session_id=?
            ORDER BY time_sec
        """,
            (room, session_id),
        )
        viewer_alarm_times = [r["time_sec"] for r in c.fetchall()]

        c.execute(
            """
            SELECT time_sec
            FROM camera_cover_events
            WHERE camera_room_id=? AND session_id=?
            ORDER BY time_sec
        """,
            (room, session_id),
        )
        camera_cover_times = [r["time_sec"] for r in c.fetchall()]

        conn.close()

        return jsonify(
            {
                "viewer_alarm_times": viewer_alarm_times,
                "camera_cover_times": camera_cover_times,
            }
        )

    except Exception as e:
        print("Alarm API Error:", e)
        return jsonify({"viewer_alarm_times": [], "camera_cover_times": []})


@app.route("/api/activity/human_detections")
def api_activity_human_detections():
    if not is_logged_in():
        return jsonify([]), 401

    room = request.args.get("camera")
    if not room:
        return jsonify([])

    try:
        session_id = get_current_or_latest_session_id(room)
        if not session_id:
            return jsonify([])

        conn = get_connection()
        c = conn.cursor()

        c.execute(
            """
            SELECT time_sec, person_count
            FROM human_detection_events
            WHERE camera_room_id=? AND session_id=?
            ORDER BY time_sec DESC
            LIMIT 50
        """,
            (room, session_id),
        )

        rows = c.fetchall()[::-1]
        conn.close()

        data = []
        for r in rows:
            data.append({"time": r["time_sec"], "count": r["person_count"]})

        return jsonify(data)

    except Exception as e:
        print("Human detection API Error:", e)
        return jsonify([])


# ============================================================
# CONTACT / FEEDBACK
# ============================================================


@app.route("/submit_inquiry", methods=["POST"])
def submit_inquiry():
    try:
        data = request.get_json()

        first_name = data.get("first_name")
        last_name = data.get("last_name")
        email = data.get("email")
        phone = data.get("phone")
        subject = data.get("subject")
        message = data.get("message")

        save_inquiry(first_name, last_name, email, phone, subject, message)

        return jsonify({"status": "success"})

    except Exception as e:
        print("Inquiry Error:", e)
        return jsonify({"status": "error"}), 500


@app.route("/submit_feedback", methods=["POST"])
def submit_feedback():
    try:
        data = request.get_json()

        message = data.get("message")
        rating = data.get("rating")

        save_feedback(message, rating)

        return jsonify({"status": "success"})

    except Exception as e:
        print("Feedback Error:", e)
        return jsonify({"status": "error"}), 500


# ============================================================
# SERVER START
# ============================================================

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
