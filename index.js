//Imports
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
require('dotenv').config()
const ObjectId = require('mongodb').ObjectId;
const admin = require("firebase-admin");
const fileUpload = require('express-fileupload');

const app = express();
const port = process.env.PORT || 5000;


//Firebase Admin Initialization
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


//Middleware use for server
app.use(cors());
app.use(express.json());
app.use(fileUpload());


//MongoDB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7qft9.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

//Function to verify user using JWT token
async function verifyToken(req, res, next) {
    if (req.headers?.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.split(' ')[1];

        try {
            const decodedUser = await admin.auth().verifyIdToken(token);
            req.decodedEmail = decodedUser.email;
        }
        catch {

        }
    }
    next();
}


async function run() {
    try {
        await client.connect();
        await client.connect();
        const database = client.db("fullStackCarApp");
        const carsCollection = database.collection("cars");
        const usersCollection = database.collection("users");
        const ordersCollection = database.collection("orders");
        const reviewsCollection = database.collection("reviews");

        //Get all cars
        app.get('/cars', async (req, res) => {
            let cursor = carsCollection.find({});
            let result;
            if (req?.query?.condition) {
                const condition = req?.query?.condition;
                if (condition === "all-cars") {
                    result = await cursor.toArray();
                }
                else if (condition === "new-cars") {
                    const query = { condition: "New" }
                    cursor = carsCollection.find(query);
                    result = await cursor.toArray();
                }
                else {
                    const query = { condition: "Used" }
                    cursor = carsCollection.find(query);
                    result = await cursor.toArray();
                }
            }
            else {
                result = await cursor.toArray();
            }
            res.json(result);
        })

        //Get single car by unique id
        app.get('/car/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const car = await carsCollection.findOne(query);
            res.json(car);
        })

        //Checking if user is admin or not
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            let isAdmin = false;
            if (user?.role === 'admin') {
                isAdmin = true;
            }
            res.json({ admin: isAdmin });
        })


        //Add users to database those who signed up with Email Password
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.json(result);
        })

        //Add users to database those who signed up with External Provider
        app.put('/users', async (req, res) => {
            const user = req.body;
            const filter = { email: user.email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.json(result);

        })

        app.put('/users/admin', verifyToken, async (req, res) => {
            const user = req.body;
            const requester = req.decodedEmail;
            if (requester) {
                const requesterAccount = await usersCollection.findOne({ email: requester });
                if (requesterAccount.role === 'admin') {
                    const filter = { email: user.email };
                    const updateDoc = { $set: { role: 'admin' } };
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    res.json(result);
                }
            }
            else {
                res.status(403).json({ message: 'you do not have access to make admin power' })
            }

        })


        app.get('/my-orders', verifyToken, async (req, res) => {
            const userEmail = req.query.email;
            if (req.decodedEmail === userEmail && userEmail !== undefined) {
                console.log('Hello')
                const query = { email: userEmail };
                const cursor = ordersCollection.find(query);
                const orderDetails = await cursor.toArray();
                res.json(orderDetails);
            }
            else {
                //Sending status of unauthorization
                res.status(401).json({ message: 'User Not Authorized' })
            }
        })

        //GET all orders for admin
        app.get('/allOrders', verifyToken, async (req, res) => {
            const userEmail = req.query.email;
            if (req.decodedEmail === userEmail && userEmail !== undefined) {
                const cursor = ordersCollection.find({});
                const result = await cursor.toArray();
                res.json(result);
            }
            else {
                //Sending status of unauthorization
                res.status(401).json({ message: 'User Not Authorized' })
            }

        })

        //UPDATE API
        app.put('/ordersUpdate/:id', async (req, res) => {
            const newStatus = req.body[0];
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: newStatus
                },
            };
            const result = await ordersCollection.updateOne(filter, updateDoc);
            res.json(result);
        })


        app.post('/orders', async (req, res) => {
            const order = req.body;
            const query = { email: order.email, modelID: order.modelID };
            const userOrder = await ordersCollection.findOne(query);
            let result;
            if (userOrder) {
                userOrder.quantity += 1;
                const filter = query;
                const options = { upsert: true };
                const updateDoc = {
                    $set: userOrder
                };
                result = await ordersCollection.updateOne(filter, updateDoc, options);
            }
            else {
                order.quantity = 1;
                result = await ordersCollection.insertOne(order);
            }
            res.json(result);
        })

        //DELETE API to delete user orders
        app.delete('/orders/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await ordersCollection.deleteOne(query);
            res.json(result);
        })

        //Reviews API
        app.get('/reviews', async (req, res) => {
            const cursor = reviewsCollection.find({});
            const result = await cursor.toArray();
            res.json(result);
        })

        app.post('/reviews', async (req, res) => {
            const review = req.body;
            const result = await reviewsCollection.insertOne(review);
            res.json(result);
        })

        //DELETE API to delete review from reviews collection by admin
        app.delete('/reviews/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await reviewsCollection.deleteOne(query);
            res.json(result);
        })

        // API to add more cars by admin
        app.post('/add-car', async (req, res) => {
            const data = req.body;
            const availableIn = JSON.parse(data?.availableIn);
            const features = JSON.parse(data?.features);
            data.availableIn = availableIn;
            data.features = features;

            // Converting images to base 64 to store in data
            const imgData = req.files.img.data;
            const encodedImg = imgData.toString('base64')
            const img = Buffer.from(encodedImg, 'base64');

            const bannerData = req.files.banner.data;
            const encodedBanner = bannerData.toString('base64')
            const banner = Buffer.from(encodedBanner, 'base64');

            data.img = img;
            data.banner = banner;

            const newCar = data;
            const result = await carsCollection.insertOne(newCar);
            res.json(result);
        })

        //DELETE API to delete car from cars collection by admin
        app.delete('/cars/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await carsCollection.deleteOne(query);
            res.json(result);
        })

        app.get('/dashboard-data', verifyToken, async (req, res) => {
            const userEmail = req.query.email;
            if (req.decodedEmail === userEmail && userEmail !== undefined) {
                let result = {};
                let cars = database.collection('cars');
                await cars.count().then((carsCount) => {
                    result.cars = carsCount;
                });
                let users = database.collection('users');
                await users.count().then((usersCount) => {
                    result.users = usersCount;
                });
                let orders = database.collection('orders');
                await orders.count().then((ordersCount) => {
                    result.orders = ordersCount;
                });
                let reviews = database.collection('reviews');
                await reviews.count().then((reviewsCount) => {
                    result.reviews = reviewsCount;
                });
                res.json(result);
            }
            else {
                //Sending status of unauthorization
                res.status(401).json({ message: 'User Not Authorized' })
            }
        })

    }
    finally {
        //   await client.close();
    }
}
run().catch(console.dir);








app.get('/', (req, res) => {
    console.log('Hitting backend');
    res.send('Car App Backend Coming Soon')
})

app.listen(port, () => {
    console.log('Listening to port number ', port);
})

