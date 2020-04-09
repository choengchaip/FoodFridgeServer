const express = require('express')
const schedule = require('node-schedule')
const app = express()
const admin = require('firebase-admin')
const serviceAccount = require('./adminData.json')
const axios = require('axios')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://foodfridge-18df3.firebaseio.com'
})

const firestore = admin.firestore()

const calculateIngredient = async function () {
  let differentDays = null
  let toMessage = []
  await firestore.collection('Fridge').get().then((docs) => {
    docs.docs.forEach((d) => {
      if (d.data().date != null && d.data().uid != null) {
        differentDays = Math.ceil((d.data().date.toDate().getTime() - new Date().getTime()) / (1000 * 3600 * 24))
        toMessage = [
          ...toMessage,
          {
            uid: d.data().uid,
            name: d.data().name,
            expireIn: differentDays
          }
        ]
      }
    })
  })

  await firestore.collection('User').get().then((docs) => {
    docs.docs.forEach((d) => {
      for (let i = 0; i < toMessage.length; i++) {
        if(toMessage[i].uid === d.data().uid){
          let message_title = `เร็วเข้า !!`
          let message_body = `${toMessage[i].name} ในตู้เย็นของคุณ จะหมดอายุใน ${toMessage[i].expireIn} วัน !!`

          toMessage[i] = {
            ...toMessage[i],
            message_token: d.data().message_token,
            message_title: message_title,
            message_body: message_body
          }
        }
      }
    })
  })

  let realMessage = []
  let blacklist = []
  for (let i = 0; i < toMessage.length; i++) {
    let only_expire = true
    let before_expire = false
    let is_black_list = false
    let condition = []

    for(let j=0; j<blacklist.length; j++){
      if(toMessage[i].uid === blacklist[j]){
        is_black_list = true
      }
    }

    if(is_black_list){
      continue
    }

    await firestore.collection('User').where('uid', '==', toMessage[i].uid).get().then((docs)=>{
      only_expire = docs.docs[0].data().only_expire == null ? true : docs.docs[0].data().only_expire
      before_expire = docs.docs[0].data().before_expire == null ? false : docs.docs[0].data().before_expire
      condition = docs.docs[0].data().min_day == null ? [] : docs.docs[0].data().min_day
    })

    if(only_expire){
      for(let j=0; j<toMessage.length; j++){
        if(toMessage[j].uid === toMessage[i].uid){
          if(toMessage[j].expireIn <= 0){
            realMessage = [
              ...realMessage,
              {
                ...toMessage[j],
                expireIn: 0,
                message_body: `${toMessage[i].name} หมดอายุแล้ว`
              }
            ]
          }
        }
      }
    }

    if(before_expire){
      for(let j=0; j<toMessage.length; j++){
        if(toMessage[j].uid === toMessage[i].uid){
          let match_day = false
          // console.log(`${toMessage[j].name} will expire in ${toMessage[j].expireIn}`)
          // console.log(`compare in list ${condition}`)
          for(let p=0; p<condition.length; p++){
            if(toMessage[j].expireIn.toString() === condition[p].toString()){
              match_day = true
            }
          }
          // console.log(`result: ${match_day ? 'pass':'fail'}`)
          if(match_day){
            realMessage = [
              ...realMessage,
              toMessage[j]
            ]
          }
        }
      }

      blacklist = [
        ...blacklist,
        toMessage[i].uid
      ]
    }
  }

  for (let i = 0; i < realMessage.length; i++) {
    await firestore.collection('Notification').add({
      uid: realMessage[i].uid,
      ingredient_name: realMessage[i].name,
      expireIn: realMessage[i].expireIn,
      created_at: new Date().getTime(),
      is_read: false
    })
  }

  for (let i = 0; i < realMessage.length; i++) {
    let body = {
      'message_payload': {
        'notification': {
          'title': realMessage[i].message_title,
          'body': realMessage[i].message_body
        },
        'data': {
          'click_action': 'FLUTTER_NOTIFICATION_CLICK',
          'status': 'done',
          "id": "1",
        }
      },
      'priority': 'high',
      'target': realMessage[i].message_token
    }

    await axios.post('https://asia-east2-foodfridge-18df3.cloudfunctions.net/sendNotification', body, {headers: { 'Content-Type': 'application/json'}})
  }

  console.log(realMessage)
  console.log('Done!!!')
}

app.listen(8082, () => {
  console.log('Server is running')

  var j = schedule.scheduleJob('20 * * * * *', calculateIngredient)
})








