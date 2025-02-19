import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import wardenModel from "../models/wardenModel.js";
import transporter from "../config/nodemailer.js";
import studentModel from "../models/studentModel.js";
import leaveApplicationModel from "../models/leaveFormModel.js";

// Controller function to log in a warden
export const loginWarden = async (req, res) => {
  try {
    // Destructure the request body
    const { email, password } = req.body;
    // Validate input fields
    if (!email) return res.status(400).json({ message: "Email is required" });
    if (!password)
      return res.status(400).json({ message: "Password is required" });

    // Check if the warden exists in the database
    const warden = await wardenModel.findOne({ email });
    if (!warden) {
      return res.status(404).json({ message: "Warden not found" });
    }

    // Verify the password
    const isPasswordValid = await bcrypt.compare(password, warden.password);
    // const isPasswordValid = password === warden.password;
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate a JWT token
    const token = jwt.sign({ id: warden._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Set the token as a cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Send success response
    return res.status(200).json({
      message: "Login successful",
      token, // Send the JWT token
      warden, // Send the student data (or user data based on your application)
      // warden: {
      //   id: warden._id,
      //   name: warden.name,
      //   email: warden.email,
      //   employeeId: warden.employeeId,
      // },
      success: true,
    });
  } catch (error) {
    //console.error(error);
    // Handle server errors
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// Controller function to log out a warden
export const logoutWarden = (req, res) => {
  try {
    // Clear the token cookie
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    });

    // Send success response
    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    // Handle server errors
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// Send password reset OTP
export const sendResetOTP = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.json({ success: false, message: "Email is required" });
  }
  try {
    const warden = await wardenModel.findOne({ email });
    if (!warden) {
      return res.json({ success: false, message: "warden not found" });
    }
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    warden.resetOtp = otp;
    warden.resetOtpExpireAt = Date.now() + 15 * 60 * 1000;
    await warden.save();
    const mailoptions = {
      from: process.env.SENDER_EMAIL,
      to: warden.email,
      subject: "Password reset OTP",
      text: `Your OTP is ${otp} to reset your password`,
    };
    await transporter.sendMail(mailoptions);
    res.json({
      success: true,
      message: "OTP sent to your email.",
    });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};
//Reset user password
export const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    return res.json({ success: false, message: "All fields are required" });
  }
  try {
    const warden = await wardenModel.findOne({ email });
    if (!warden) {
      return res.json({ success: false, message: "warden not found" });
    }
    if (warden.resetOtp === "" || warden.resetOtp !== otp) {
      return res.json({ success: false, message: "Invalid OTP" });
    }
    if (warden.resetOtpExpireAt < Date.now()) {
      return res.json({ success: false, message: "OTP has expired" });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    warden.password = hashedPassword;
    warden.resetOtp = "";
    warden.resetOtpExpireAt = 0;
    await warden.save();
    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};
// creating getWardenData function to get the data of the warden
export const getWardenData = async (req, res) => {
  try {
    const { userId } = req.body;
    const warden = await wardenModel.findById(userId);
    if (!warden) {
      return res.json({ success: false, message: "warden not found" });
    }
    res.json({
      success: true,
      wardenData: {
        name: warden.name,
        email: warden.email,
        registrationNumber: warden.registrationNumber,
        hostel: warden.hostelName,
        phoneNumber: warden.phoneNumber,
        isAccountVerified: warden.isAccountVerified,
      },
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};
// Controller function to add a new warden (only Chief Warden can add)
export const addWarden = async (req, res) => {
  try {
    const { name, employeeId, email, phoneNumber, hostelName, password } =
      req.body;

    // Validate input fields
    if (!name || !employeeId || !email || !phoneNumber || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // // Check if the logged-in user is a ChiefWarden
    // if (req.user.role !== "ChiefWarden") {
    //   return res
    //     .status(403)
    //     .json({ message: "You are not authorized to add a warden" });
    // }

    // Check if the warden already exists
    const existingWarden = await wardenModel.findOne({ email });
    if (existingWarden) {
      return res.status(400).json({ message: "Warden already exists" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new warden
    const newWarden = new wardenModel({
      name,
      employeeId,
      email,
      phoneNumber,
      hostelName,
      password: hashedPassword,
      //role: "Warden", // New wardens are assigned the 'Warden' role
      isAccountVerified: true, // The account is initially not verified
    });

    // Save the new warden to the database
    await newWarden.save();

    // Send a welcome email to the new warden
    const mailOptions = {
      from: process.env.SENDER_EMAIL,
      to: newWarden.email,
      subject: "Welcome to the Hostel Management System",
      text: `Hello ${newWarden.name},\n\nWelcome to the Hostel Management System. You have been added as a Warden.\n\nYour initial password is: ${password}\n\nPlease log in with your credentials to access the system. It is highly recommended that you change your password after logging in for security purposes.\n\nBest regards,\nHostel Management Team`,
    };

    await transporter.sendMail(mailOptions);

    // Send success response
    return res.status(201).json({
      message: "Warden added successfully and a welcome email has been sent",
      success: true,
      warden: {
        id: newWarden._id,
        name: newWarden.name,
        email: newWarden.email,
        employeeId: newWarden.employeeId,
      },
    });
  } catch (error) {
    // Handle server errors
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// making an controller to get students stats
export const getMetrics = async (req, res) => {
  try {
    const { userId } = req.body; // Extract userId from middleware

    // Find the warden/chief warden
    const warden = await wardenModel.findById(userId);
    if (!warden) {
      return res.status(404).json({
        success: false,
        message: "Warden not found",
      });
    }

    const { role, hostelName } = warden; // Extract role & hostel from user data

    let totalStudents, onLeaveCount, presentCount;
    if (role === "ChiefWarden") {
      // Get metrics for all hostels
      totalStudents = await studentModel.countDocuments();
      onLeaveCount = await leaveApplicationModel.countDocuments({
        status: "Approved",
      });
      presentCount = totalStudents - onLeaveCount;

      return res.status(200).json({
        role: "ChiefWarden",
        totalStudents,
        onLeave: onLeaveCount,
        present: presentCount,
        message: "Metrics fetched for Chief Warden.",
      });
    }

    if (role === "Warden") {
      if (!hostelName) {
        return res.status(400).json({
          success: false,
          message: "Hostel name is required for Warden role.",
        });
      }

      // Get metrics only for this warden's hostel
      totalStudents = await studentModel.countDocuments({ hostelName });
      onLeaveCount = await leaveApplicationModel.countDocuments({
        status: "Approved",
        hostelName,
      });
      presentCount = totalStudents - onLeaveCount;
      return res.status(200).json({
        role: "Warden",
        hostelName,
        totalStudents,
        onLeave: onLeaveCount,
        present: presentCount,
        message: `Metrics fetched for ${hostelName} Warden.`,
      });
    }

    return res.status(403).json({
      success: false,
      message: "Unauthorized role.",
    });
  } catch (error) {
    console.error("Error fetching metrics:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
// Get all wardens for Chief Warden
export const getAllWardens = async (req, res) => {
  try {
    const wardens = await wardenModel.find({}, "name hostelName");

    if (!wardens || wardens.length === 0) {
      return res.status(404).json({ message: "No wardens found" });
    }
    res.status(200).json(wardens);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
