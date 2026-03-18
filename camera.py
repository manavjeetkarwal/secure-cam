"""
============================================================
SECURECAM - CAMERA PROCESSING MODULE (camera.py)
============================================================
"""

import cv2
import time
import os

from database import save_video, save_motion

camera = None
camera_url = None
recording = False
out = None
video_filename = None
prev_frame = None
last_save_time = time.time()
session_id = None
session_start_time = None
camera_room_id = None


def start_session(room_id=None):
    """
    Start only a logical camera session.
    No OpenCV camera is opened here.
    """
    global session_id, session_start_time, camera_room_id, last_save_time, prev_frame

    session_id = str(int(time.time() * 1000))
    session_start_time = time.time()
    camera_room_id = room_id if room_id else "default"
    last_save_time = time.time()
    prev_frame = None


def set_camera(url, room_id=None):
    """
    Initializes the OpenCV camera stream if needed.
    """
    global camera, camera_url
    global session_id, session_start_time
    global camera_room_id, last_save_time, prev_frame

    last_save_time = time.time()
    prev_frame = None

    if url.isdigit():
        camera_url = int(url)
    else:
        camera_url = url

    if camera is not None:
        camera.release()

    camera = cv2.VideoCapture(camera_url)

    session_id = str(int(time.time() * 1000))
    session_start_time = time.time()
    camera_room_id = room_id if room_id else "default"


def start_recording():
    global recording, out, camera, video_filename

    if camera is None or not camera.isOpened():
        print("Error: Camera not initialized")
        return

    width = int(camera.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(camera.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if not os.path.exists("recordings"):
        os.makedirs("recordings")

    video_filename = f"recordings/video_{int(time.time())}.mp4"
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(video_filename, fourcc, 20.0, (width, height))

    recording = True
    print(f"Started recording: {video_filename}")


def stop_recording():
    global recording, out, video_filename

    recording = False

    if out is not None:
        out.release()
        out = None

        video_filename = None


def generate_frames():
    """
    Optional OpenCV-based frame generation.
    Not used for activity page motion now.
    """
    global camera, recording, out
    global prev_frame, last_save_time
    global session_id, session_start_time, camera_room_id

    if camera is None:
        set_camera("0")

    while True:
        success, frame = camera.read()

        if not success:
            time.sleep(0.1)
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # lower blur so small hand movement is preserved more
        gray = cv2.GaussianBlur(gray, (11, 11), 0)

        motion_count = 0

        if prev_frame is not None:
            frame_delta = cv2.absdiff(prev_frame, gray)

            # lower threshold so small movement is detected
            thresh = cv2.threshold(frame_delta, 12, 255, cv2.THRESH_BINARY)[1]
            thresh = cv2.dilate(thresh, None, iterations=2)

            contours, _ = cv2.findContours(
                thresh,
                cv2.RETR_EXTERNAL,
                cv2.CHAIN_APPROX_SIMPLE
            )

            for c in contours:
                # smaller contour area so hand movement counts
                if cv2.contourArea(c) < 80:
                    continue
                motion_count += 1

        prev_frame = gray

        if time.time() - last_save_time > 5:
            try:
                if session_start_time is not None:
                    time_sec = int(time.time() - session_start_time)
                    save_motion(
                        camera_room_id,
                        session_id,
                        time_sec,
                        motion_count
                    )
            except Exception as e:
                print(f"DB Error: {e}")

            last_save_time = time.time()

        if recording and out is not None:
            out.write(frame)

        ret, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()

        yield (
            b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n\r\n'
            + frame_bytes +
            b'\r\n'
        )