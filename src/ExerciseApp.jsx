import React, { useState, useEffect, useRef, useCallback } from "react";
import Webcam from "react-webcam";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";
import {
  Activity,
  ChevronRight,
  Timer,
  Dumbbell,
  Flame,
  History,
  Info,
  X,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";

// Exercise information with calories per rep
const exerciseInfo = {
  Pushups: {
    description:
      "A classic upper body exercise that targets chest, shoulders, and triceps.",
    instructions:
      "1. Start in plank position\n2. Lower body until chest nearly touches ground\n3. Push back up to starting position\n4. Keep body straight throughout",
    caloriesPerRep: 0.5,
    image:
      "https://images.unsplash.com/photo-1598971639058-fab3c3109a34?auto=format&fit=crop&q=80&w=2376&ixlib=rb-4.0.3",
  },
  Squats: {
    description:
      "A fundamental lower body exercise targeting quads, hamstrings, and glutes.",
    instructions:
      "1. Stand with feet shoulder-width apart\n2. Lower body as if sitting back into a chair\n3. Keep chest up and back straight\n4. Return to standing position",
    caloriesPerRep: 0.3,
    image:
      "https://images.unsplash.com/photo-1574680096145-d05b474e2155?auto=format&fit=crop&q=80&w=2369&ixlib=rb-4.0.3",
  },
  Pullups: {
    description: "An advanced upper body exercise targeting back and biceps.",
    instructions:
      "1. Hang from bar with overhand grip\n2. Pull body up until chin over bar\n3. Lower body with control\n4. Maintain straight body throughout",
    caloriesPerRep: 1,
    image:
      "https://images.unsplash.com/photo-1598971639058-fab3c3109a34?auto=format&fit=crop&q=80&w=2376&ixlib=rb-4.0.3",
  },
  "Dumbbell Curls": {
    description: "An isolation exercise targeting the biceps muscles.",
    instructions:
      "1. Stand with dumbbells at sides\n2. Curl weights toward shoulders\n3. Lower with control\n4. Keep elbows close to body",
    caloriesPerRep: 0.4,
    image:
      "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&q=80&w=2370&ixlib=rb-4.0.3",
  },
  "Jumping Jacks": {
    description:
      "A full-body cardio exercise that raises heart rate and improves coordination.",
    instructions:
      "1. Start with feet together, arms at sides\n2. Jump feet apart while raising arms\n3. Jump back to starting position\n4. Maintain rhythm",
    caloriesPerRep: 0.2,
    image:
      "https://images.unsplash.com/photo-1601422407692-ec4eeec1d9b3?auto=format&fit=crop&q=80&w=2370&ixlib=rb-4.0.3",
  },
};

const ExerciseApp = () => {
  const workoutPlan = [
    { name: "Pushups", reps: 1 },
    { name: "Squats", reps: 1 },
    { name: "Pullups", reps: 1 },
    { name: "Dumbbell Curls", reps: 1 },
    { name: "Jumping Jacks", reps: 1 },
  ];

  const [workoutHistory, setWorkoutHistory] = useState(() => {
    const saved = localStorage.getItem("workoutHistory");
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedExerciseInfo, setSelectedExerciseInfo] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [workoutSummary, setWorkoutSummary] = useState(null);

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [detector, setDetector] = useState(null);
  const [exerciseCount, setExerciseCount] = useState({
    pushups: 0,
    squats: 0,
    pullups: 0,
    "dumbbell curls": 0,
    "jumping jacks": 0,
  });

  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(-1);
  const [isWorkoutStarted, setIsWorkoutStarted] = useState(false);
  const [showNextButton, setShowNextButton] = useState(false);

  // Timer states
  const [timer, setTimer] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const timerRef = useRef(null);
  const [exerciseTimes, setExerciseTimes] = useState(
    Array(workoutPlan.length).fill(0)
  );

  const isExerciseInProgressRef = useRef(false);
  const isDetectionActive = useRef(false);

  const [pullupPosition, setPullupPosition] = useState("up");
  const [pushupPosition, setPushupPosition] = useState("up");
  const [squatPosition, setSquatPosition] = useState("up");
  const [dumbbellCurlPosition, setDumbbellCurlPosition] = useState("down");
  const [jumpingJackPosition, setJumpingJackPosition] = useState("down");

  const detectExercise = useCallback(
    (keypoints) => {
      if (!keypoints || !isDetectionActive.current) return;

      const keypointsMap = {};
      keypoints.forEach((kp) => {
        keypointsMap[kp.name] = kp;
      });

      const currentExercise = workoutPlan[currentExerciseIndex]?.name;

      // Only detect the current exercise
      switch (currentExercise) {
        case "Pushups":
          detectPushup(keypointsMap);
          break;
        case "Squats":
          detectSquat(keypointsMap);
          break;
        case "Pullups":
          detectPullup(keypointsMap);
          break;
        case "Dumbbell Curls":
          detectDumbbellCurl(keypointsMap);
          break;
        case "Jumping Jacks":
          detectJumpingJacks(keypointsMap);
          break;
      }
    },
    [currentExerciseIndex]
  );

  useEffect(() => {
    const loadModel = async () => {
      await tf.ready();
      const detectorConfig = {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
      };
      const moveNet = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        detectorConfig
      );
      setDetector(moveNet);
      console.log("MoveNet model loaded!");
    };

    loadModel();
  }, []);

  const detectPose = useCallback(async () => {
    if (!detector || !webcamRef.current) return;

    const video = webcamRef.current.video;
    if (!video) return;

    try {
      const poses = await detector.estimatePoses(video, {
        flipHorizontal: false,
      });

      if (poses.length > 0) {
        // console.log("Detected Pose:", poses[0]);
        drawPose(poses[0], 640, 480);
        detectExercise(poses[0].keypoints);
      } else {
        console.warn("No poses detected");
      }
    } catch (error) {
      console.error("Error estimating poses:", error);
    }

    requestAnimationFrame(detectPose);
  }, [detectExercise, detector]);

  useEffect(() => {
    if (detector) {
      detectPose();
    }
  }, [detector, detectPose]);

  const calculateAngle = (a, b, c) => {
    const radians =
      Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
  };

  const detectJumpingJacks = (keypointsMap) => {
    const leftShoulder = keypointsMap["left_shoulder"];
    const rightShoulder = keypointsMap["right_shoulder"];
    const leftElbow = keypointsMap["left_elbow"];
    const rightElbow = keypointsMap["right_elbow"];
    const leftHip = keypointsMap["left_hip"];
    const rightHip = keypointsMap["right_hip"];

    if (
      leftShoulder &&
      rightShoulder &&
      leftElbow &&
      rightElbow &&
      leftHip &&
      rightHip &&
      leftShoulder.score > 0.5 &&
      rightShoulder.score > 0.5 &&
      leftElbow.score > 0.5 &&
      rightElbow.score > 0.5 &&
      leftHip.score > 0.5 &&
      rightHip.score > 0.5
    ) {
      // Function to compute angle using three points (A, B, C)
      const calculateAngle = (A, B, C) => {
        const AB = { x: A.x - B.x, y: A.y - B.y };
        const CB = { x: C.x - B.x, y: C.y - B.y };

        const dotProduct = AB.x * CB.x + AB.y * CB.y;
        const magnitudeAB = Math.sqrt(AB.x ** 2 + AB.y ** 2);
        const magnitudeCB = Math.sqrt(CB.x ** 2 + CB.y ** 2);

        const cosTheta = dotProduct / (magnitudeAB * magnitudeCB);
        return Math.acos(cosTheta) * (180 / Math.PI); // Convert to degrees
      };

      // Compute Shoulder-Elbow-Hip angles
      const leftAngle = calculateAngle(leftShoulder, leftElbow, leftHip);
      const rightAngle = calculateAngle(rightShoulder, rightElbow, rightHip);

      // Maintain a rolling average over the last 5 frames
      const angleHistory = { left: [], right: [] };
      const maxFrames = 5;

      const smoothAngle = (history, angle) => {
        history.push(angle);
        if (history.length > maxFrames) history.shift(); // Keep only the last 5 values
        return history.reduce((sum, val) => sum + val, 0) / history.length; // Average
      };

      const smoothLeftAngle = smoothAngle(angleHistory.left, leftAngle);
      const smoothRightAngle = smoothAngle(angleHistory.right, rightAngle);

      // Determine jumping jack position
      setJumpingJackPosition((prevPos) => {
        if (smoothLeftAngle > 130 && smoothRightAngle > 130) {
          // Arms are down
          if (prevPos === "up" && !isExerciseInProgressRef.current) {
            console.log("Jumping Jack: Down position detected");
            setExerciseCount((prevCount) => ({
              ...prevCount,
              "jumping jacks": prevCount["jumping jacks"] + 1,
            }));
            isExerciseInProgressRef.current = true; // Prevent multiple increments
            return "down";
          }
        } else if (smoothLeftAngle < 60 && smoothRightAngle < 60) {
          // Arms are up
          if (prevPos === "down") {
            console.log("Jumping Jack: Up position detected");
            isExerciseInProgressRef.current = false; // Allow counting again on next down
            return "up";
          }
        }

        return prevPos;
      });
    }
  };

  const calculateTotalCalories = () => {
    let total = 0;
    Object.entries(exerciseCount).forEach(([exercise, count]) => {
      const exerciseName = exercise
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
      total += count * (exerciseInfo[exerciseName]?.caloriesPerRep || 0);
    });
    return total;
  };

  const calculateTotalTime = () => {
    return exerciseTimes.reduce((total, num) => total + num, 0);
  };

  const completeWorkout = () => {
    const totalCalories = calculateTotalCalories();
    const totalTime = calculateTotalTime();
    const summary = {
      date: new Date().toISOString(),
      calories: totalCalories,
      duration: totalTime,
      exercises: Object.entries(exerciseCount).map(([name, count]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        count,
      })),
    };

    setWorkoutHistory((prev) => {
      const newHistory = [...prev, summary];
      localStorage.setItem("workoutHistory", JSON.stringify(newHistory));
      return newHistory;
    });

    setWorkoutSummary(summary);
    stopTimer();
  };

  const detectPushup = (keypointsMap) => {
    const leftElbow = keypointsMap["left_elbow"];
    const rightElbow = keypointsMap["right_elbow"];
    const leftShoulder = keypointsMap["left_shoulder"];
    const rightShoulder = keypointsMap["right_shoulder"];
    const leftWrist = keypointsMap["left_wrist"];
    const rightWrist = keypointsMap["right_wrist"];
    const nose = keypointsMap["nose"];

    if (
      leftElbow &&
      rightElbow &&
      leftShoulder &&
      rightShoulder &&
      leftWrist &&
      rightWrist &&
      nose &&
      leftElbow.score > 0.5 &&
      rightElbow.score > 0.5 &&
      leftShoulder.score > 0.5 &&
      rightShoulder.score > 0.5 &&
      leftWrist.score > 0.5 &&
      rightWrist.score > 0.5 &&
      nose.score > 0.5
    ) {
      // Calculate angles
      const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
      const rightElbowAngle = calculateAngle(
        rightShoulder,
        rightElbow,
        rightWrist
      );

      // Define angle thresholds
      const ELBOW_ANGLE_THRESHOLD_DOWN = 110;
      const ELBOW_ANGLE_THRESHOLD_UP = 145;

      setPushupPosition((prevPos) => {
        // Check if elbows are bent + nose is below shoulders
        const isDownPosition =
          leftElbowAngle < ELBOW_ANGLE_THRESHOLD_DOWN &&
          rightElbowAngle < ELBOW_ANGLE_THRESHOLD_DOWN &&
          nose.y > leftShoulder.y && // Nose should be below the left shoulder
          nose.y > rightShoulder.y; // Nose should be below the right shoulder

        if (isDownPosition) {
          if (prevPos !== "down") {
            console.log("Pushup: Down position detected");
            isExerciseInProgressRef.current = false; // Reset flag when user goes down
            return "down";
          }
        } else if (
          leftElbowAngle > ELBOW_ANGLE_THRESHOLD_UP &&
          rightElbowAngle > ELBOW_ANGLE_THRESHOLD_UP
        ) {
          if (prevPos === "down" && !isExerciseInProgressRef.current) {
            console.log("Pushup: Up position detected");
            setExerciseCount((prevCount) => ({
              ...prevCount,
              pushups: prevCount.pushups + 1,
            }));
            isExerciseInProgressRef.current = true; // Prevent multiple increments
          }
          return "up";
        }

        return prevPos;
      });
    }
  };

  const detectSquat = (keypointsMap) => {
    const leftKnee = keypointsMap["left_knee"];
    const rightKnee = keypointsMap["right_knee"];
    const leftHip = keypointsMap["left_hip"];
    const rightHip = keypointsMap["right_hip"];

    if (
      leftKnee &&
      rightKnee &&
      leftHip &&
      rightHip &&
      leftKnee.score > 0.2 &&
      rightKnee.score > 0.2 &&
      leftHip.score > 0.2 &&
      rightHip.score > 0.2
    ) {
      const isKneeBend = leftKnee.y < leftHip.y && rightKnee.y < rightHip.y; // Check if knees are bent
      const isStanding = leftKnee.y > leftHip.y && rightKnee.y > rightHip.y; // Check if standing

      setSquatPosition((prevPos) => {
        if (isKneeBend && prevPos !== "down") {
          console.log("Squat down position detected");
          isExerciseInProgressRef.current = true; // Set to true when in squat position
          return "down"; // Indicate that the user is in a squat position
        } else if (isStanding && prevPos === "down") {
          if (isExerciseInProgressRef.current) {
            console.log("Standing position detected");
            setExerciseCount((prevCount) => ({
              ...prevCount,
              squats: prevCount.squats + 1, // Increment count when standing up
            }));
            isExerciseInProgressRef.current = false; // Reset progress flag
          }
          return "up"; // Indicate that the user is standing
        }

        return prevPos; // Return the previous position if no change
      });

      // Reset the exercise in progress flag when back to standing
      if (isStanding) {
        isExerciseInProgressRef.current = false;
      }
    }
  };

  const detectPullup = (keypointsMap) => {
    const leftShoulder = keypointsMap["left_shoulder"];
    const rightShoulder = keypointsMap["right_shoulder"];
    const leftElbow = keypointsMap["left_elbow"];
    const rightElbow = keypointsMap["right_elbow"];

    if (
      leftShoulder &&
      rightShoulder &&
      leftElbow &&
      rightElbow &&
      leftShoulder.score > 0.5 &&
      rightShoulder.score > 0.5 &&
      leftElbow.score > 0.5 &&
      rightElbow.score > 0.5
    ) {
      setPullupPosition((prevPos) => {
        const isHanging =
          leftElbow.y > leftShoulder.y && rightElbow.y > rightShoulder.y; // Elbows are below shoulders
        const isPullingUp =
          leftElbow.y < leftShoulder.y && rightElbow.y < rightShoulder.y; // Elbows are above shoulders

        // Count the pull-up when coming from hanging to pulling up
        if (
          isPullingUp &&
          prevPos === "down" &&
          !isExerciseInProgressRef.current
        ) {
          console.log("Pull-up: Up position detected");
          setExerciseCount((prevCount) => ({
            ...prevCount,
            pullups: prevCount.pullups + 1,
          }));
          isExerciseInProgressRef.current = true; // Set to true when a pull-up is counted
          return "up"; // Update position to up
        } else if (isHanging && prevPos === "up") {
          console.log("Pull-up: Down position detected");
          isExerciseInProgressRef.current = false; // Reset when going back down
          return "down"; // Update position to down
        }

        return prevPos; // Maintain previous position if no change
      });
    }
  };

  const detectDumbbellCurl = (keypointsMap) => {
    const leftShoulder = keypointsMap["left_shoulder"];
    const leftElbow = keypointsMap["left_elbow"];
    const leftWrist = keypointsMap["left_wrist"];
    const rightShoulder = keypointsMap["right_shoulder"];
    const rightElbow = keypointsMap["right_elbow"];
    const rightWrist = keypointsMap["right_wrist"];

    if (
      leftShoulder &&
      leftElbow &&
      leftWrist &&
      rightShoulder &&
      rightElbow &&
      rightWrist &&
      leftShoulder.score > 0.5 &&
      leftElbow.score > 0.5 &&
      leftWrist.score > 0.5 &&
      rightShoulder.score > 0.5 &&
      rightElbow.score > 0.5 &&
      rightWrist.score > 0.5
    ) {
      // Calculate angles for both arms
      const leftArmAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
      const rightArmAngle = calculateAngle(
        rightShoulder,
        rightElbow,
        rightWrist
      );

      const PER_THRESHOLD_UP = 105; // Angle threshold for the upward position
      const PER_THRESHOLD_DOWN = 145; // Angle threshold for the downward position

      setDumbbellCurlPosition((prevPos) => {
        if (
          leftArmAngle > PER_THRESHOLD_DOWN &&
          rightArmAngle > PER_THRESHOLD_DOWN
        ) {
          // Both arms are in the downward position
          if (prevPos === "up" && !isExerciseInProgressRef.current) {
            console.log("Dumbbell Curl: Down position detected");
            setExerciseCount((prevCount) => ({
              ...prevCount,
              "dumbbell curls": prevCount["dumbbell curls"] + 1,
            }));
            isExerciseInProgressRef.current = true; // Prevent multiple increments
          }
          return "down";
        } else if (
          leftArmAngle < PER_THRESHOLD_UP &&
          rightArmAngle < PER_THRESHOLD_UP
        ) {
          // Both arms are in the upward position
          if (prevPos === "down") {
            console.log("Dumbbell Curl: Up position detected");
            isExerciseInProgressRef.current = false; // Reset when going back up
          }
          return "up";
        }
        return prevPos; // Maintain previous position if no change
      });
    }
  };

  const drawPose = (pose, videoWidth, videoHeight) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const canvas = canvasRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!pose || !pose.keypoints) return;

    const scaleX = canvas.width / videoWidth;
    const scaleY = canvas.height / videoHeight;

    const flippedKeypoints = pose.keypoints.map((keypoint) => ({
      ...keypoint,
      x: (videoWidth - keypoint.x) * scaleX,
      y: keypoint.y * scaleY,
    }));

    flippedKeypoints.forEach((keypoint) => {
      if (keypoint.score > 0.3) {
        ctx.beginPath();
        ctx.arc(keypoint.x, keypoint.y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = "yellow";
        ctx.fill();
      }
    });

    const skeleton = [
      ["nose", "left_eye"],
      ["nose", "right_eye"],
      ["left_eye", "left_ear"],
      ["right_eye", "right_ear"],
      ["left_shoulder", "right_shoulder"],
      ["left_shoulder", "left_elbow"],
      ["right_shoulder", "right_elbow"],
      ["left_elbow", "left_wrist"],
      ["right_elbow", "right_wrist"],
      ["left_hip", "right_hip"],
      ["left_hip", "left_knee"],
      ["right_hip", "right_knee"],
      ["left_knee", "left_ankle"],
      ["right_knee", "right_ankle"],
    ];

    const keypointsMap = {};
    flippedKeypoints.forEach((kp) => {
      keypointsMap[kp.name] = kp;
    });

    skeleton.forEach(([partA, partB]) => {
      const kpA = keypointsMap[partA];
      const kpB = keypointsMap[partB];

      if (kpA && kpB && kpA.score > 0.2 && kpB.score > 0.2) {
        ctx.beginPath();
        ctx.moveTo(kpA.x, kpA.y);
        ctx.lineTo(kpB.x, kpB.y);
        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  };

  const startTimer = () => {
    setIsTimerActive(true);
    setTimer(0); // Reset timer to 0
    timerRef.current = setInterval(() => {
      setTimer((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    clearInterval(timerRef.current);
    setIsTimerActive(false);
  };

  const startWorkout = () => {
    setIsWorkoutStarted(true);
    setCurrentExerciseIndex(0); // Start with the first exercise
    handleExerciseChange(workoutPlan[0].name);
    isDetectionActive.current = true; // Set the first exercise
    startTimer(); // Start the timer when the workout begins
  };

  const handleExerciseChange = () => {
    // Reset positions and flags
    setPushupPosition("up");
    setSquatPosition("up");
    setPullupPosition("up");
    setDumbbellCurlPosition("down");
    setJumpingJackPosition("down");
    isExerciseInProgressRef.current = false; // Reset progress flag

    // Add the current timer value to exerciseTimes
    setExerciseTimes((prev) => [...prev, timer]);

    // Reset timer for the new exercise
    setTimer(0);
  };

  const nextExercise = () => {
    isDetectionActive.current = false;

    setCurrentExerciseIndex((prevValue) => {
      const nextIndex = prevValue + 1;

      if (nextIndex < workoutPlan.length) {
        stopTimer();
        setExerciseTimes((prevTimes) => {
          const newTimes = [...prevTimes];
          newTimes[prevValue] = timer; // Store the time for the current exercise
          return newTimes;
        });
        handleExerciseChange(workoutPlan[nextIndex].name);
        isDetectionActive.current = true;
        startTimer();
        return nextIndex;
      } else {
        completeWorkout();
        setIsWorkoutStarted(false);
        setCurrentExerciseIndex(-1);
        setExerciseCount({
          pushups: 0,
          squats: 0,
          pullups: 0,
          "dumbbell curls": 0,
          "jumping jacks": 0,
        });
        stopTimer();
        return -1;
      }
    });
  };

  useEffect(() => {
    // Check if the current exercise's reps are completed
    const currentExerciseName =
      workoutPlan[currentExerciseIndex]?.name.toLowerCase();
    if (
      currentExerciseName &&
      exerciseCount[currentExerciseName] >=
        workoutPlan[currentExerciseIndex]?.reps
    ) {
      // Show the Next button if the current exercise is completed
      setShowNextButton(true);
    } else {
      setShowNextButton(false);
    }
  }, [exerciseCount, currentExerciseIndex]);

  const getPosition = (exercise) => {
    if (exercise === "Pushups") {
      return pushupPosition;
    } else if (exercise === "Squats") {
      return squatPosition;
    } else if (exercise === "Pullups") {
      return pullupPosition;
    } else if (exercise === "Dumbbell Curls") {
      return dumbbellCurlPosition;
    } else if (exercise === "Jumping Jacks") {
      return jumpingJackPosition;
    }
    return ""; // Return an empty string or a default value if the exercise is not recognized
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] bg-[url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1920&auto=format&fit=crop')] bg-cover bg-center bg-blend-overlay transition-all duration-500">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {" "}
        {/* Reduced py-8 to py-6 */}
        <header className="flex items-center justify-between mb-10 animate-fadeIn backdrop-blur-sm bg-black/30 p-5 rounded-2xl border border-zinc-800">
          {" "}
          {/* Reduced p-6 to p-5 and mb-12 to mb-10 */}
          <div className="flex items-center gap-3">
            <Activity className="w-12 h-12 text-sky-400 " />
            <h1 className="text-2xl font-extrabold text-white tracking-tighter">
              {" "}
              {/* Reduced text-3xl to text-2xl */}
              VISIONARY <span className=" text-sky-400">FITNESS</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-sky-400 text-white rounded-lg hover:bg-sky-600/90 transition-all duration-300 font-bold uppercase tracking-wider text-xs"
            >
              <History className="w-5 h-5" />
              History
            </button>
            {isWorkoutStarted && (
              <div className="flex items-center gap-2 bg-zinc-800 px-5 py-2.5 rounded-lg text-white border border-zinc-700">
                {" "}
                {/* Reduced px-6 to px-5 and py-3 to py-2.5 */}
                <Timer className="w-5 h-5 text-sky-400" />
                <span className="font-mono text-lg">{timer}s</span>{" "}
                {/* Reduced text-xl to text-lg */}
              </div>
            )}
          </div>
        </header>
        {selectedExerciseInfo && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-zinc-900 rounded-2xl max-w-2xl w-full p-6 border border-zinc-800 transform transition-all duration-300 scale-100 animate-slideIn">
              {" "}
              {/* Reduced p-8 to p-6 */}
              <div className="flex justify-between items-start mb-5">
                {" "}
                {/* Reduced mb-6 to mb-5 */}
                <h3 className="text-2xl font-bold text-white">
                  {" "}
                  {/* Reduced text-3xl to text-2xl */}
                  {selectedExerciseInfo.name}
                </h3>
                <button
                  onClick={() => setSelectedExerciseInfo(null)}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <img
                src={exerciseInfo[selectedExerciseInfo.name].image}
                alt={selectedExerciseInfo.name}
                className="w-full h-56 object-cover rounded-xl mb-5 border border-zinc-800"
              />
              <p className="text-zinc-300 mb-5 text-base">
                {" "}
                {/* Reduced text-lg to text-base */}
                {exerciseInfo[selectedExerciseInfo.name].description}
              </p>
              <div className="bg-zinc-800 rounded-xl p-5 border border-zinc-700">
                {" "}
                {/* Reduced p-6 to p-5 */}
                <h4 className="font-bold text-white mb-3 text-lg">
                  {" "}
                  {/* Reduced text-xl to text-lg */}
                  Instructions:
                </h4>
                <pre className="whitespace-pre-line text-zinc-300 leading-relaxed">
                  {exerciseInfo[selectedExerciseInfo.name].instructions}
                </pre>
              </div>
            </div>
          </div>
        )}
        {showHistory && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-zinc-900 rounded-2xl max-w-4xl w-full p-6 border border-zinc-800">
              {" "}
              {/* Reduced p-8 to p-6 */}
              <div className="flex justify-between items-center mb-6">
                {" "}
                {/* Reduced mb-8 to mb-6 */}
                <h3 className="text-2xl font-bold text-white">
                  {" "}
                  {/* Reduced text-3xl to text-2xl */}
                  Workout History
                </h3>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-zinc-500 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="h-56 mb-6 bg-zinc-800 p-4 rounded-xl border border-zinc-700">
                {" "}
                {/* Reduced h-64 to h-56 and mb-8 to mb-6 */}
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={workoutHistory}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(date) => format(new Date(date), "MM/dd")}
                      stroke="#71717a"
                    />
                    <YAxis stroke="#71717a" />
                    <Tooltip
                      labelFormatter={(date) =>
                        format(new Date(date), "MM/dd/yyyy")
                      }
                      contentStyle={{
                        backgroundColor: "#18181b",
                        border: "1px solid #3f3f46",
                        borderRadius: "0.5rem",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="calories"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      name="Calories Burned"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-4 custom-scrollbar">
                {" "}
                {/* Reduced space-y-4 to space-y-3 */}
                {workoutHistory.map((workout, index) => (
                  <div key={index} className="border-b border-zinc-800 pb-3">
                    {" "}
                    {/* Reduced pb-4 to pb-3 */}
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-white">
                        {format(new Date(workout.date), "MMM dd, yyyy HH:mm")}
                      </span>
                      <div className="flex items-center gap-5">
                        {" "}
                        {/* Reduced gap-6 to gap-5 */}
                        <span className="flex items-center gap-2 text-zinc-300">
                          <Timer className="w-4 h-4 text-sky-400" />
                          {workout.duration}s
                        </span>
                        <span className="flex items-center gap-2 text-zinc-300">
                          <Flame className="w-4 h-4 text-sky-400" />
                          {workout.calories.toFixed(1)} cal
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-zinc-400">
                      {" "}
                      {/* Reduced text-sm to text-xs */}
                      {workout.exercises.map((exercise, i) => (
                        <span key={i} className="mr-5">
                          {" "}
                          {/* Reduced mr-6 to mr-5 */}
                          {exercise.name}: {exercise.count} reps
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {workoutSummary && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6 text-center border border-zinc-800">
              {" "}
              {/* Reduced p-8 to p-6 */}
              <h3 className="text-2xl font-bold mb-5 text-white">
                {" "}
                {/* Reduced text-3xl to text-2xl and mb-6 to mb-5 */}
                Workout Complete! 💪
              </h3>
              <div className="space-y-3 mb-6">
                {" "}
                {/* Reduced space-y-4 to space-y-3 and mb-8 to mb-6 */}
                <div className="flex justify-between items-center p-5 bg-zinc-800 rounded-xl border border-zinc-700">
                  {" "}
                  {/* Reduced p-6 to p-5 */}
                  <span className="font-medium text-white">Total Time:</span>
                  <span className="flex items-center gap-2 text-zinc-300">
                    <Timer className="w-5 h-5 text-sky-400" />
                    {workoutSummary.duration}s
                  </span>
                </div>
                <div className="flex justify-between items-center p-5 bg-zinc-800 rounded-xl border border-zinc-700">
                  {" "}
                  {/* Reduced p-6 to p-5 */}
                  <span className="font-medium text-white">
                    Calories Burned:
                  </span>
                  <span className="flex items-center gap-2 text-zinc-300">
                    <Flame className="w-5 h-5 text-sky-400" />
                    {workoutSummary.calories.toFixed(1)}
                  </span>
                </div>
                <div className="bg-zinc-800 rounded-xl p-5 border border-zinc-700">
                  {" "}
                  {/* Reduced p-6 to p-5 */}
                  <h4 className="font-medium mb-3 text-white">
                    {" "}
                    {/* Reduced mb-4 to mb-3 */}
                    Exercise Summary:
                  </h4>
                  {workoutSummary.exercises.map((exercise, index) => (
                    <div
                      key={index}
                      className="flex justify-between text-xs mb-2 last:mb-0"
                    >
                      <span className="text-zinc-300">{exercise.name}:</span>
                      <span className="text-zinc-300">
                        {exercise.count} reps
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setWorkoutSummary(null)}
                className="w-full px-5 py-3 bg-sky-600 text-white rounded-xl font-bold uppercase tracking-wider hover:bg-red-500 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
        {!isWorkoutStarted ? (
          <div className="text-center py-20 animate-fadeIn backdrop-blur-sm bg-black/30 rounded-3xl border border-zinc-800">
            {" "}
            {/* Reduced py-24 to py-20 */}
            <Dumbbell className="w-24 h-24 text-sky-400 mx-auto mb-6 animate-bounce" />{" "}
            {/* Reduced mb-8 to mb-6 */}
            <h2 className="text-4xl font-extrabold text-white mb-5 tracking-tight">
              {" "}
              {/* Reduced text-5xl to text-4xl and mb-6 to mb-5 */}
              Ready to <span className="text-sky-400">Transform</span>?
            </h2>
            <p className="text-zinc-300 mb-10 text-lg">
              {" "}
              {/* Reduced text-xl to text-lg and mb-12 to mb-10 */}
              Your journey to a stronger self starts here!
            </p>
            <button
              onClick={startWorkout}
              className="px-8 py-5 bg-sky-600 text-white rounded-xl font-bold text-lg uppercase tracking-wider
                shadow-lg shadow-sky-400/20 hover:bg-sky-600/90   "
            >
              Start Your Journey
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-slideIn">
            {" "}
            {/* Reduced gap-8 to gap-6 */}
            <div className="space-y-5">
              {" "}
              {/* Reduced space-y-6 to space-y-5 */}
              <div className="backdrop-blur-sm bg-black/30 rounded-2xl shadow-lg p-6 border border-zinc-800">
                {" "}
                {/* Reduced p-8 to p-6 */}
                <h2 className="text-2xl font-bold text-white mb-5">
                  {" "}
                  {/* Reduced text-3xl to text-2xl and mb-6 to mb-5 */}
                  Workout Progress
                </h2>
                <div className="space-y-3">
                  {" "}
                  {/* Reduced space-y-4 to space-y-3 */}
                  {workoutPlan.map((exercise, index) => {
                    const progress = Math.min(
                      100,
                      (exerciseCount[exercise.name.toLowerCase()] /
                        exercise.reps) *
                        100
                    );

                    return (
                      <div
                        key={exercise.name}
                        className={`rounded-xl p-5 transition-all duration-300 ${
                          index === currentExerciseIndex
                            ? "bg-sky-600/20 border-2 border-sky-500"
                            : "bg-zinc-800/50 border border-zinc-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex justify-center flex-col gap-2">
                              <div className="flex gap-3 items-center">
                                <h3 className="font-bold text-lg text-white">
                                  {" "}
                                  {/* Reduced text-xl to text-lg */}
                                  {exercise.name}
                                </h3>
                                <button
                                  onClick={() =>
                                    setSelectedExerciseInfo(exercise)
                                  }
                                  className="text-zinc-400 hover:text-white transition-colors"
                                >
                                  <Info className="w-5 h-5" />
                                </button>
                              </div>

                              {index === currentExerciseIndex && (
                                <span className="text-zinc-300 ">
                                  {" "}
                                  {/* Reduced text-sm to text-xs */}
                                  Position: {getPosition(exercise.name)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-5">
                            {" "}
                            {/* Reduced gap-6 to gap-5 */}
                            <div className="text-lg font-mono">
                              <span className="text-white">
                                {index < currentExerciseIndex && (
                                  <>{exercise.reps}</>
                                )}
                                {index === currentExerciseIndex && (
                                  <>
                                    {exerciseCount[exercise.name.toLowerCase()]}
                                  </>
                                )}
                                {(currentExerciseIndex === -1 ||
                                  index > currentExerciseIndex) && (
                                  <>
                                    {exerciseCount[exercise.name.toLowerCase()]}
                                  </>
                                )}
                              </span>
                              <span className="text-gray-400">
                                /{exercise.reps}
                              </span>
                            </div>
                            {index === currentExerciseIndex &&
                              showNextButton && (
                                <button
                                  onClick={nextExercise}
                                  className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg 
                              font-bold uppercase tracking-wider text-xs
                              hover:bg-green-500 transition-all duration-300 "
                                >
                                  Next
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              )}
                          </div>
                        </div>
                        {index === currentExerciseIndex && (
                          <div className="mt-3 bg-zinc-900 rounded-lg p-1">
                            {" "}
                            {/* Reduced mt-4 to mt-3 */}
                            <div
                              className="bg-sky-400 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border-2 border-zinc-800">
              <Webcam
                ref={webcamRef}
                videoConstraints={{
                  facingMode: "user",
                  width: 640,
                  height: 480,
                }}
                audio={false}
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full"
                width={640}
                height={480}
              />
              <div className="absolute bottom-0 left-0 right-0 backdrop-blur-md bg-black/50 p-5">
                {" "}
                {/* Reduced p-6 to p-5 */}
                <p className="text-white text-center text-m ">
                  {" "}
                  {/* Reduced text-xl to text-lg */}
                  {currentExerciseIndex !== -1
                    ? `Performing: ${workoutPlan[currentExerciseIndex].name}`
                    : "Get ready for your next exercise"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExerciseApp;
