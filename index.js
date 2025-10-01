const dotenv = require("dotenv");
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
// Stripe initialization removed
// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("eliteArena");

    const usersCollection = db.collection("userscollection");
    const courtsCollection = db.collection("courts");
    const bookingsCollection = db.collection("bookings");
    const couponsCollection = db.collection("coupons");
    const announcementsCollection = db.collection("announcements");
    const paymentsCollection = client.db("eliteArena").collection("payments");

    //  Save or update user
    app.put("/users", async (req, res) => {
      const user = req.body;
      const email = user?.email;
      const name = user?.name;
      const image = user?.image;

      if (!email || !name) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const query = { email };

      try {
        const existingUser = await usersCollection.findOne(query);
        const now = new Date();

        if (existingUser) {
          const updateResult = await usersCollection.updateOne(query, {
            $set: { lastLoggedIn: now },
          });

          return res.status(200).json({
            message: "User already exists. Updated lastLoggedIn.",
            updated: true,
            result: updateResult,
          });
        }

        const newUser = {
          name,
          email,
          image: image || null,
          role: "user",
          createdAt: now,
          lastLoggedIn: now,
        };
        const result = await usersCollection.insertOne(newUser);
        res.status(201).json({
          message: "User created successfully.",
          inserted: true,
          result,
        });
      } catch (error) {
        res.status(500).json({
          error: "User save failed",
          details: error.message,
        });
      }
    });

    // Get all users with optional search & role filter
    app.get("/users", async (req, res) => {
      try {
        const { search, role } = req.query;
        const query = {};

        if (role && ["user", "member", "admin"].includes(role)) {
          query.role = role;
        }

        if (search) {
          query.$or = [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ];
        }

        const users = await usersCollection
          .find(query)
          .project({ name: 1, email: 1, role: 1, image: 1, createdAt: 1 })
          .toArray();

        res.status(200).json(users);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch users", details: error.message });
      }
    });

    // Get all members
    app.get("/members", async (req, res) => {
      try {
        const members = await usersCollection
          .find({ role: "member" })
          .project({ name: 1, email: 1, image: 1, role: 1 })
          .toArray();

        res.status(200).json(members);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch members" });
      }
    });

    // Get admin overview
    app.get("/admin/overview", async (req, res) => {
      const totalUsers = await usersCollection.countDocuments();
      const totalBookings = await bookingsCollection.countDocuments();
      const totalMembers = await usersCollection.countDocuments({ role: "member" });

      res.send({ totalUsers, totalBookings, totalMembers });
    });

    // get user role by email
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;

      try {
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({ role: user.role });
      } catch (error) {
        console.error("Error fetching role:", error);
        return res.status(500).json({ message: "Server error" });
      }
    });

    // Downgrade member
    app.patch("/members/downgrade/:id", async (req, res) => {
      const userId = req.params.id;

      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(userId), role: "member" },
          { $set: { role: "user" } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ error: "User not found or already not a member" });
        }

        res.status(200).json({ message: "Member downgraded to user" });
      } catch (error) {
        res.status(500).json({
          error: "Failed to downgrade member",
          details: error.message,
        });
      }
    });

    // get user by email
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }
      res.send(user);
    });

    // update profile data
    app.patch("/users/:email", async (req, res) => {
      const email = req.params.email;
      const { name, image } = req.body;

      const updateDoc = { $set: {} };

      if (name) updateDoc.$set.name = name;
      if (image) updateDoc.$set.image = image;

      const result = await usersCollection.updateOne({ email }, updateDoc);

      res.send(result);
    });

    // Create court
    app.post("/courts", async (req, res) => {
      try {
        const court = req.body;
        const result = await courtsCollection.insertOne(court);
        res.status(201).json(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to create court", details: error.message });
      }
    });

    // Get courts
    app.get("/courts", async (req, res) => {
      try {
        const courts = await courtsCollection.find().toArray();
        res.status(200).json(courts);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch courts" });
      }
    });

    // Update court
    app.patch("/courts/:id", async (req, res) => {
      const courtId = req.params.id;
      const updateData = req.body;

      try {
        const result = await courtsCollection.updateOne(
          { _id: new ObjectId(courtId) },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Court not found" });
        }

        res.status(200).json({ message: "Court updated successfully", result });
      } catch (error) {
        res.status(500).json({ error: "Failed to update court", details: error.message });
      }
    });

    // Delete court
    app.delete("/courts/:id", async (req, res) => {
      const courtId = req.params.id;

      try {
        const result = await courtsCollection.deleteOne({ _id: new ObjectId(courtId) });

        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Court not found" });
        }

        res.status(200).json({ message: "Court deleted successfully" });
      } catch (error) {
        res.status(500).json({ error: "Failed to delete court", details: error.message });
      }
    });

    // Create booking
    app.post("/bookings", async (req, res) => {
      try {
        const booking = req.body;
        booking.status = "pending"; // enforce status
        booking.createdAt = new Date();

        const result = await bookingsCollection.insertOne(booking);
        res.status(201).json(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to create booking", details: error.message });
      }
    });

    // Get all bookings
    app.get("/bookings", async (req, res) => {
      try {
        const bookings = await bookingsCollection.find().toArray();
        res.status(200).json(bookings);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch bookings" });
      }
    });

    // Get all pending bookings
    app.get("/bookings/pending", async (req, res) => {
      try {
        const pendingBookings = await bookingsCollection.find({ status: "pending" }).toArray();
        res.status(200).json(pendingBookings);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch pending bookings" });
      }
    });

    // Get pending bookings for specific user
    app.get("/bookings/pending/:userId", async (req, res) => {
      try {
        const userId = req.params.userId;
        const userPending = await bookingsCollection.find({ status: "pending", userId }).toArray();
        res.status(200).json(userPending);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch user pending bookings" });
      }
    });

    // Update booking status with validation and "paid" support
    app.patch("/bookings/:id", async (req, res) => {
      const bookingId = req.params.id;
      const { status } = req.body;

      const validStatuses = ["approved", "pending", "rejected", "paid"];

      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status value" });
      }

      try {
        const booking = await bookingsCollection.findOne({ _id: new ObjectId(bookingId) });

        if (!booking) {
          return res.status(404).json({ error: "Booking not found" });
        }

        if (status === "paid" && booking.status !== "approved") {
          return res.status(400).json({
            error: "Booking must be approved before marking as paid",
          });
        }

        const bookingUpdateResult = await bookingsCollection.updateOne(
          { _id: new ObjectId(bookingId) },
          { $set: { status } }
        );

        if (status === "approved") {
          const user = await usersCollection.findOne({ email: booking.userEmail });

          if (user && user.role === "user") {
            await usersCollection.updateOne({ email: booking.userEmail }, { $set: { role: "member" } });
          }
        }

        res.status(200).json({
          message: `Booking status updated to ${status}`,
          bookingUpdateResult,
        });
      } catch (error) {
        res.status(500).json({
          error: "Failed to update booking status",
          details: error.message,
        });
      }
    });

    // Get approved bookings by email
    app.get("/bookings/approved/:email", async (req, res) => {
      const userEmail = req.params.email;

      try {
        const approvedBookings = await bookingsCollection
          .find({ status: "approved", userEmail })
          .toArray();

        res.status(200).json(approvedBookings);
      } catch (error) {
        res.status(500).json({
          error: "Failed to fetch approved bookings",
          details: error.message,
        });
      }
    });

    // Get booking by ID
    app.get("/bookings/:id", async (req, res) => {
      const bookingId = req.params.id;

      try {
        const booking = await bookingsCollection.findOne({ _id: new ObjectId(bookingId) });

        if (!booking) {
          return res.status(404).json({ error: "Booking not found" });
        }

        res.status(200).json(booking);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch booking", details: error.message });
      }
    });

    // Delete booking (reject)
    app.delete("/bookings/:id", async (req, res) => {
      const bookingId = req.params.id;

      try {
        const result = await bookingsCollection.deleteOne({ _id: new ObjectId(bookingId) });

        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Booking not found" });
        }

        res.status(200).json({ message: "Booking cancelled successfully" });
      } catch (error) {
        res.status(500).json({ error: "Failed to cancel booking" });
      }
    });

    // Coupons CRUD (create, validate, get, update, delete)
    app.post("/coupons", async (req, res) => {
      try {
        const { title, description, coupon, discountAmount } = req.body;

        if (!title || !description || !coupon || !discountAmount) {
          return res.status(400).json({ error: "Missing required fields" });
        }

        const existing = await couponsCollection.findOne({ coupon });
        if (existing) {
          return res.status(409).json({ error: "Coupon already exists" });
        }

        const newCoupon = {
          title,
          description,
          coupon,
          discountAmount: Number(discountAmount),
        };

        const result = await couponsCollection.insertOne(newCoupon);
        res.status(201).json({ message: "Coupon added", result });
      } catch (error) {
        res.status(500).json({ error: "Failed to add coupon", details: error.message });
      }
    });

    app.post("/coupons/validate", async (req, res) => {
      const { couponCode } = req.body;

      if (!couponCode) {
        return res.status(400).json({ error: "Coupon code is required" });
      }

      try {
        const coupon = await couponsCollection.findOne({ coupon: couponCode });

        if (!coupon) {
          return res.status(404).json({ error: "Coupon code not found" });
        }

        res.status(200).json({ valid: true, discountAmount: coupon.discountAmount });
      } catch (error) {
        res.status(500).json({ error: "Coupon validation failed", details: error.message });
      }
    });

    app.get("/coupons", async (req, res) => {
      try {
        const coupons = await couponsCollection.find().toArray();
        res.status(200).json(coupons);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch coupons" });
      }
    });

    app.patch("/coupons/:id", async (req, res) => {
      const couponId = req.params.id;
      const updateData = { ...req.body };

      delete updateData._id;

      if (updateData.discountAmount !== undefined) {
        updateData.discountAmount = Number(updateData.discountAmount);
      }

      try {
        const result = await couponsCollection.updateOne(
          { _id: new ObjectId(couponId) },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Coupon not found" });
        }

        res.status(200).json({ message: "Coupon updated", result });
      } catch (error) {
        res.status(500).json({ error: "Failed to update coupon" });
      }
    });

    app.delete("/coupons/:id", async (req, res) => {
      const couponId = req.params.id;

      try {
        const result = await couponsCollection.deleteOne({ _id: new ObjectId(couponId) });

        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Coupon not found" });
        }

        res.status(200).json({ message: "Coupon deleted" });
      } catch (error) {
        res.status(500).json({ error: "Failed to delete coupon" });
      }
    });

    // Announcements CRUD
    app.get("/announcements", async (req, res) => {
      try {
        const announcements = await announcementsCollection.find().sort({ _id: -1 }).toArray();
        res.status(200).json(announcements);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch announcements" });
      }
    });

    app.post("/announcements", async (req, res) => {
      try {
        const { title, content } = req.body;

        if (!title || !content) {
          return res.status(400).json({ error: "Title and content are required" });
        }

        const newAnnouncement = {
          title,
          content,
          createdAt: new Date().toISOString(),
        };

        const result = await announcementsCollection.insertOne(newAnnouncement);
        const announcement = { ...newAnnouncement, _id: result.insertedId };

        res.status(201).json({ message: "Announcement added", announcement });
      } catch (error) {
        res.status(500).json({ error: "Failed to add announcement" });
      }
    });

    app.patch("/announcements/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid announcement ID" });
        }

        const { title, content } = req.body;

        if (!title || !content) {
          return res.status(400).json({ error: "Title and content are required" });
        }

        const result = await announcementsCollection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: { title, content, updatedAt: new Date().toISOString() } },
          { returnOriginal: false }
        );

        if (!result) {
          return res.status(404).json({ error: "Announcement not found" });
        }

        res.status(200).json({ message: "Announcement updated", announcement: result });
      } catch (error) {
        res.status(500).json({ error: "Failed to update announcement" });
      }
    });

    app.delete("/announcements/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid announcement ID" });
        }

        const result = await announcementsCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Announcement not found" });
        }

        res.status(200).json({ message: "Announcement deleted" });
      } catch (error) {
        res.status(500).json({ error: "Failed to delete announcement" });
      }
    });

    // Health check
    app.get("/", (req, res) => {
      res.send("Soni Blissful Events SCMS Backend Running");
    });

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed", error);
  }
}

run();
