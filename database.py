"""
============================================================
SECURECAM - DATABASE MODULE (database.py)
============================================================
"""

import sqlite3
from datetime import datetime

DB = "securecam.db"


# ============================================================
# DATABASE CONNECTION
# ============================================================


def get_connection():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


# ============================================================
# DATABASE INITIALIZATION
# ============================================================


def init_db():
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
    CREATE TABLE IF NOT EXISTS users(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        email TEXT,
        phone TEXT,
        dob TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    c.execute("INSERT OR IGNORE INTO sqlite_sequence(name, seq) VALUES ('users', 100)")

    c.execute("""
    CREATE TABLE IF NOT EXISTS videos(
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        viewer_user_id INTEGER,
        camera_room_id TEXT,
        file_path TEXT,
        record_date TEXT,
        record_time TEXT,
        duration_seconds INTEGER
    )
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS photos(
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        viewer_user_id INTEGER,
        camera_room_id TEXT,
        file_path TEXT,
        capture_date TEXT,
        capture_time TEXT
    )
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS camera_sessions(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camera_room_id TEXT,
        session_id TEXT UNIQUE,
        camera_user_id INTEGER,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP
    )
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS motion_events(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camera_room_id TEXT,
        session_id TEXT,
        time_sec INTEGER,
        motion_count INTEGER
    )
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS viewer_alarm_events(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        viewer_user_id INTEGER,
        camera_room_id TEXT,
        session_id TEXT,
        time_sec INTEGER
    )
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS camera_cover_events(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camera_room_id TEXT,
        session_id TEXT,
        time_sec INTEGER
    )
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS human_detection_events(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camera_room_id TEXT,
        session_id TEXT,
        time_sec INTEGER,
        person_count INTEGER
    )
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS inquiries(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT,
        last_name TEXT,
        email TEXT,
        phone TEXT,
        subject TEXT,
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS feedback(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT,
        rating INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()
    conn.close()


# ============================================================
# USER MANAGEMENT
# ============================================================


def add_user(username, password, email, phone, dob):
    conn = get_connection()
    c = conn.cursor()

    c.execute(
        "INSERT INTO users(username,password,email,phone,dob) VALUES (?,?,?,?,?)",
        (username, password, email, phone, dob),
    )

    conn.commit()
    conn.close()


def get_user(username):
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM users WHERE username=?", (username,))
    user = c.fetchone()

    conn.close()
    return user


def get_user_by_id(uid):
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM users WHERE id=?", (uid,))
    user = c.fetchone()

    conn.close()
    return user


def update_user(uid, username, password, email, phone, dob):
    conn = get_connection()
    c = conn.cursor()

    if password:
        c.execute(
            """
        UPDATE users
        SET username=?, password=?, email=?, phone=?, dob=?
        WHERE id=?
        """,
            (username, password, email, phone, dob, uid),
        )
    else:
        c.execute(
            """
        UPDATE users
        SET username=?, email=?, phone=?, dob=?
        WHERE id=?
        """,
            (username, email, phone, dob, uid),
        )

    conn.commit()
    conn.close()


def delete_user(uid):
    conn = get_connection()
    c = conn.cursor()

    c.execute("DELETE FROM users WHERE id=?", (uid,))

    conn.commit()
    conn.close()


# ============================================================
# CAMERA SESSION MANAGEMENT
# ============================================================


def save_camera_session(camera_room_id, session_id, camera_user_id=None):
    conn = get_connection()
    c = conn.cursor()

    c.execute(
        """
    INSERT OR IGNORE INTO camera_sessions
    (camera_room_id, session_id, camera_user_id)
    VALUES (?,?,?)
    """,
        (camera_room_id, session_id, camera_user_id),
    )

    conn.commit()
    conn.close()


def mark_camera_session_ended(session_id):
    conn = get_connection()
    c = conn.cursor()

    c.execute(
        """
    UPDATE camera_sessions
    SET ended_at=CURRENT_TIMESTAMP
    WHERE session_id=?
    """,
        (session_id,),
    )

    conn.commit()
    conn.close()


def get_latest_session_id(camera_room_id):
    conn = get_connection()
    c = conn.cursor()

    c.execute(
        """
    SELECT session_id
    FROM camera_sessions
    WHERE camera_room_id=?
    ORDER BY id DESC
    LIMIT 1
    """,
        (camera_room_id,),
    )

    row = c.fetchone()

    conn.close()
    return row["session_id"] if row else None


# ============================================================
# MEDIA STORAGE
# ============================================================


def save_video(path, viewer_user_id, camera_room_id, duration):
    conn = get_connection()
    c = conn.cursor()

    now = datetime.now()
    record_date = now.strftime("%Y-%m-%d")
    record_time = now.strftime("%H:%M:%S")

    try:
        duration = int(duration)
    except (TypeError, ValueError):
        duration = 0

    c.execute(
        """
    INSERT INTO videos
    (viewer_user_id, camera_room_id, file_path, record_date, record_time, duration_seconds)
    VALUES (?,?,?,?,?,?)
    """,
        (viewer_user_id, camera_room_id, path, record_date, record_time, duration),
    )

    conn.commit()
    conn.close()


def save_photo(path, viewer_user_id, camera_room_id):
    conn = get_connection()
    c = conn.cursor()

    now = datetime.now()
    capture_date = now.strftime("%Y-%m-%d")
    capture_time = now.strftime("%H:%M:%S")

    c.execute(
        """
    INSERT INTO photos
    (viewer_user_id, camera_room_id, file_path, capture_date, capture_time)
    VALUES (?,?,?,?,?)
    """,
        (viewer_user_id, camera_room_id, path, capture_date, capture_time),
    )

    conn.commit()
    conn.close()


# ============================================================
# MOTION DETECTION EVENTS
# ============================================================


def save_motion(camera_room_id, session_id, time_sec, count):
    conn = get_connection()
    c = conn.cursor()

    try:
        time_sec = int(time_sec)
    except (TypeError, ValueError):
        time_sec = 0

    try:
        count = int(count)
    except (TypeError, ValueError):
        count = 0

    c.execute(
        """
    INSERT INTO motion_events
    (camera_room_id, session_id, time_sec, motion_count)
    VALUES (?,?,?,?)
    """,
        (camera_room_id, session_id, time_sec, count),
    )

    conn.commit()
    conn.close()


def clear_motion_events():
    conn = get_connection()
    c = conn.cursor()

    c.execute("DELETE FROM motion_events")

    conn.commit()
    conn.close()


# ============================================================
# FETCH USER MEDIA
# ============================================================


def get_user_videos(uid):
    conn = get_connection()
    c = conn.cursor()

    c.execute(
        """
    SELECT * FROM videos
    WHERE viewer_user_id=?
    ORDER BY seq DESC
    """,
        (uid,),
    )

    rows = c.fetchall()

    conn.close()
    return rows


def get_user_photos(uid):
    conn = get_connection()
    c = conn.cursor()

    c.execute(
        """
    SELECT * FROM photos
    WHERE viewer_user_id=?
    ORDER BY seq DESC
    """,
        (uid,),
    )

    rows = c.fetchall()

    conn.close()
    return rows


def get_video_by_seq_and_user(seq, uid):
    conn = get_connection()
    c = conn.cursor()

    c.execute(
        """
    SELECT * FROM videos
    WHERE seq=? AND viewer_user_id=?
    """,
        (seq, uid),
    )

    row = c.fetchone()

    conn.close()
    return row


def get_photo_by_seq_and_user(seq, uid):
    conn = get_connection()
    c = conn.cursor()

    c.execute(
        """
    SELECT * FROM photos
    WHERE seq=? AND viewer_user_id=?
    """,
        (seq, uid),
    )

    row = c.fetchone()

    conn.close()
    return row


# ============================================================
# DELETE MEDIA
# ============================================================


def delete_video_record_by_user(seq, uid):
    conn = get_connection()
    c = conn.cursor()

    c.execute(
        """
    SELECT file_path FROM videos
    WHERE seq=? AND viewer_user_id=?
    """,
        (seq, uid),
    )
    row = c.fetchone()

    if not row:
        conn.close()
        return None

    path = row["file_path"]

    c.execute(
        """
    DELETE FROM videos
    WHERE seq=? AND viewer_user_id=?
    """,
        (seq, uid),
    )

    conn.commit()
    conn.close()

    return path


def delete_photo_record_by_user(seq, uid):
    conn = get_connection()
    c = conn.cursor()

    c.execute(
        """
    SELECT file_path FROM photos
    WHERE seq=? AND viewer_user_id=?
    """,
        (seq, uid),
    )
    row = c.fetchone()

    if not row:
        conn.close()
        return None

    path = row["file_path"]

    c.execute(
        """
    DELETE FROM photos
    WHERE seq=? AND viewer_user_id=?
    """,
        (seq, uid),
    )

    conn.commit()
    conn.close()

    return path


# ============================================================
# SECURITY EVENTS
# ============================================================


def save_viewer_alarm(viewer_user_id, camera_room_id, session_id, time_sec):
    conn = get_connection()
    c = conn.cursor()

    try:
        time_sec = int(time_sec)
    except (TypeError, ValueError):
        time_sec = 0

    c.execute(
        """
    INSERT INTO viewer_alarm_events
    (viewer_user_id, camera_room_id, session_id, time_sec)
    VALUES (?,?,?,?)
    """,
        (viewer_user_id, camera_room_id, session_id, time_sec),
    )

    conn.commit()
    conn.close()


def save_camera_cover(camera_room_id, session_id, time_sec):
    conn = get_connection()
    c = conn.cursor()

    try:
        time_sec = int(time_sec)
    except (TypeError, ValueError):
        time_sec = 0

    c.execute(
        """
    INSERT INTO camera_cover_events
    (camera_room_id, session_id, time_sec)
    VALUES (?,?,?)
    """,
        (camera_room_id, session_id, time_sec),
    )

    conn.commit()
    conn.close()


def save_human_detection(camera_room_id, session_id, time_sec, person_count=1):
    conn = get_connection()
    c = conn.cursor()

    try:
        time_sec = int(time_sec)
    except (TypeError, ValueError):
        time_sec = 0

    try:
        person_count = int(person_count)
    except (TypeError, ValueError):
        person_count = 1

    c.execute(
        """
    INSERT INTO human_detection_events
    (camera_room_id, session_id, time_sec, person_count)
    VALUES (?,?,?,?)
    """,
        (camera_room_id, session_id, time_sec, person_count),
    )

    conn.commit()
    conn.close()


# ============================================================
# CONTACT / FEEDBACK STORAGE
# ============================================================


def save_inquiry(first_name, last_name, email, phone, subject, message):
    conn = get_connection()
    c = conn.cursor()

    c.execute(
        """
    INSERT INTO inquiries
    (first_name, last_name, email, phone, subject, message)
    VALUES (?,?,?,?,?,?)
    """,
        (first_name, last_name, email, phone, subject, message),
    )

    conn.commit()
    conn.close()


def save_feedback(message, rating):
    conn = get_connection()
    c = conn.cursor()

    try:
        rating = int(rating)
    except (TypeError, ValueError):
        rating = 0

    c.execute(
        """
    INSERT INTO feedback
    (message, rating)
    VALUES (?,?)
    """,
        (message, rating),
    )

    conn.commit()
    conn.close()
