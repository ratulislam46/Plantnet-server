require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')

const stripe = require('stripe')(process.env.STRIPE_SK_KEY);
const port = process.env.PORT || 3000
const app = express()

// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token

  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})
async function run() {
  try {

    const planetsCollection = client.db('planetnet').collection('plants');
    const ordersCollection = client.db('planetnet').collection('orders');
    const usersCollection = client.db('planetnet').collection('users');

    // Generate jwt token
    app.post('/jwt', async (req, res) => {
      const email = req.body
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })
    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
      } catch (err) {
        res.status(500).send(err)
      }
    })

    // plant get from db 
    app.get('/plants', async (req, res) => {
      const allPlant = await planetsCollection.find().toArray();
      res.send(allPlant)
    })

    // single plant get from db 
    app.get('/plant/:id', async (req, res) => {
      const id = req.params.id;
      const result = await planetsCollection.findOne({ _id: new ObjectId(id) })
      res.send(result)
    })

    // create payment intent for order 
    app.post('/create-payment-intent', async (req, res) => {
      const { plantId, quantity } = req.body;
      const plant = await planetsCollection.findOne({ _id: new ObjectId(plantId) })
      if (!plant) return res.status(404).send({ message: 'Plant Not Found' });
      const totalPrice = quantity * plant?.price * 100

      // stripe 
      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalPrice,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
      });

      res.send({ clientSecret: paymentIntent.client_secret })
    })

    // save order data in orders collection in db 
    app.post('/order', async (req, res) => {
      const orderData = req.body;
      const result = await ordersCollection.insertOne(orderData);
      res.send(result)
    })

    app.post('/user', async (req, res) => {
      const userData = req.body;
      userData.role = 'customer'
      userData.create_at = new Date().toISOString()
      userData.last_loggedIn = new Date().toISOString()

      // cheack db by user email if email is already have db then update last logged in time
      const query = { email: userData.email }
      const alreadyUserDB = await usersCollection.findOne(query)

      if (!!alreadyUserDB) {
        const result = await usersCollection.updateOne(query, {
          $set: { last_loggedIn: new Date().toISOString() }
        })
        return res.send(result)
      }

      const result = await usersCollection.insertOne(userData)
      res.send(result)
    })

    // plant post db 
    app.post('/add-plant', async (req, res) => {
      const body = req.body;
      const result = await planetsCollection.insertOne(body)
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from plantNet Server..')
})

app.listen(port, () => {
  console.log(`plantNet is running on port ${port}`)
})
