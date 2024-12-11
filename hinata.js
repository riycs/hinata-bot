import setting from "./setting.js"
import { Client, Serialize } from "./lib/serialize.js"

import baileys from "@whiskeysockets/baileys"
const { useMultiFileAuthState, DisconnectReason, makeInMemoryStore, jidNormalizedUser, makeCacheableSignalKeyStore, PHONENUMBER_MCC } = baileys
import { Boom } from "@hapi/boom"
import Pino from "pino"
import NodeCache from "node-cache"
import chalk from "chalk"
import readline from "readline"
import { parsePhoneNumber } from "libphonenumber-js"
import open from "open"
import path from "path"

const store = makeInMemoryStore({ logger: Pino({ level: "fatal" }).child({ level: "fatal" }) })

// start
async function start() {
   process.on("unhandledRejection", (err) => console.error(err))

   const { state, saveCreds } = await useMultiFileAuthState(`./${setting.options.sessionName}`)
   const msgRetryCounterCache = new NodeCache() // retry message "waiting message"

   const hinata = baileys.default({
      logger: Pino({ level: "fatal" }).child({ level: "fatal" }),
      printQRInTerminal: true,
      auth: {
         creds: state.creds,
         keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: "fatal" }).child({ level: "fatal" })),
      },
      browser: ['Chrome (Linux)', '', ''],
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      getMessage: async (key) => {
         let jid = jidNormalizedUser(key.remoteJid)
         let msg = await store.loadMessage(jid, key.id)

         return msg?.message || ""
      },
      msgRetryCounterCache,
      defaultQueryTimeoutMs: undefined,
   })

   // bind store
   store.bind(hinata.ev)

   // update store.contacts
   hinata.ev.on("contacts.update", (update) => {
      for (let contact of update) {
         let id = jidNormalizedUser(contact.id)
         if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
      }
   })

   // bind extra client
   await Client({ hinata, store })

   // auto restart
   hinata.ev.on("connection.update", async (update) => {
      const { lastDisconnect, connection, qr } = update
      if (connection) {
         console.info(`Connection Status : ${connection}`)
      }

      if (connection === "close") {
         let reason = new Boom(lastDisconnect?.error)?.output.statusCode
         if (reason === DisconnectReason.badSession) {
            console.log(`Bad Session File, Please Delete Session and Scan Again`)
            process.send('reset')
         } else if (reason === DisconnectReason.connectionClosed) {
            console.log("Connection closed, reconnecting....")
            await start()
         } else if (reason === DisconnectReason.connectionLost) {
            console.log("Connection Lost from Server, reconnecting...")
            await start()
         } else if (reason === DisconnectReason.connectionReplaced) {
            console.log("Connection Replaced, Another New Session Opened, Please Close Current Session First")
            process.exit(1)
         } else if (reason === DisconnectReason.loggedOut) {
            console.log(`Device Logged Out, Please Scan Again And Run.`)
            process.exit(1)
         } else if (reason === DisconnectReason.restartRequired) {
            console.log("Restart Required, Restarting...")
            await start()
         } else if (reason === DisconnectReason.timedOut) {
            console.log("Connection TimedOut, Reconnecting...")
            process.send('reset')
         } else if (reason === DisconnectReason.multideviceMismatch) {
            console.log("Multi device mismatch, please scan again")
            process.exit(0)
         } else {
            console.log(reason)
            process.send('reset')
         }
      }

      if (connection === "open") {
         hinata.sendMessage(setting.options.owner[0] + "@s.whatsapp.net", {
            text: `${hinata?.user?.name || "Hinata"} telah terhubung`,
         })
      }
   })

   // write session
   hinata.ev.on("creds.update", saveCreds)

   // messages
   hinata.ev.on("messages.upsert", async (message) => {
      if (!message.messages) return
      const m = await Serialize(hinata, message.messages[0])
      await (await import(`./message/message.js?v=${Date.now()}`)).default(hinata, m, message)
   })

   // auto reject call
   hinata.ev.on("call", async (json) => {
      if (setting.options.antiCall) {
         for (const id of json) {
            if (id.status === "offer") {
               let msg = await hinata.sendMessage(id.from, {
                  text: `Maaf untuk saat ini, Kami tidak dapat menerima panggilan, entah dalam group atau pribadi\n\nJika Membutuhkan bantuan ataupun Request Fitur silahkan chat Owner🤗`,
                  mentions: [id.from],
               })
               hinata.sendContact(id.from, setting.options.owner, msg)
               await hinata.rejectCall(id.id, id.from)
            }
         }
      }
   })

   return hinata
}

start()
