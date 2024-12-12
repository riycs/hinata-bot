import setting from "../setting.js"
import Func from "../lib/function.js"
import { tiktok } from "../lib/tiktok.js"

import fs from "fs"
import chalk from "chalk"
import axios from "axios"
import path from "path"
import { getBinaryNodeChildren } from "@whiskeysockets/baileys"
import { exec } from "child_process"
import { format } from "util"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const __filename = Func.__filename(import.meta.url)
const require = createRequire(import.meta.url)

export default async function Message(hinata, m, chatUpdate) {
    try {
        if (!m) return
        if (!setting.options.public && !m.isOwner) return
        if (m.isBaileys) return

        const prefix = m.prefix
        const isCmd = m.body.startsWith(prefix)
        const command = isCmd ? m.command.toLowerCase() : ""
        const quoted = m.isQuoted ? m.quoted : m

        // log chat
        if (isCmd && !m.isBaileys) {
            hinata.sendPresenceUpdate("composing", m.from)
            console.log(chalk.black(chalk.bgWhite("- FROM")), chalk.black(chalk.bgGreen(m.pushName)), chalk.black(chalk.yellow(m.sender)) + "\n" + chalk.black(chalk.bgWhite("- IN")), chalk.black(chalk.bgGreen(m.isGroup ? m.metadata.subject : "Private Chat", m.from)) + "\n" + chalk.black(chalk.bgWhite("- MESSAGE")), chalk.black(chalk.bgGreen(m.body || m.type)))
        }

        switch (command) {

            // main
            case "menu": case "help": {
                let text = `*Main:*
${prefix}help
${prefix}owner
${prefix}script
${prefix}speed

*Convert:*
${prefix}sticker
${prefix}toimage

*Download:*
${prefix}tiktok

*Group:*
${prefix}hidetag
${prefix}add
${prefix}linkgroup

*Owner:*
${prefix}mode
${prefix}rvo`
                return m.reply(text)
            }
            break
            case "owner": {
                hinata.sendContact(m.from, setting.options.owner, m)
            }
            break
            case "script": case "sc": {
                m.reply("https://github.com/riycs/hinata-bot")
            }
            break
            case "speed": {
                const moment = (await import("moment-timezone")).default
                const calculatePing = function (timestamp, now) {
                    return moment.duration(now - moment(timestamp * 1000)).asSeconds();
                }
                m.reply(`Speed: ${calculatePing(m.timestamp, Date.now())} second(s)`)
            }
            break

            // convert
            case "sticker": case "s": case "stiker": {
                if (/image|video|webp/i.test(quoted.mime)) {
                    m.reply("wait")
                    const buffer = await quoted.download()
                    if (quoted?.msg?.seconds > 10) return m.reply(`Durasi video maks 9 detik`)
                    let exif
                    if (m.text) {
                        let [packname, author] = m.text.split("|")
                        exif = { packName: packname ? packname : "", packPublish: author ? author : "" }
                    } else {
                        exif = { ...setting.Exif }
                    }
                    m.reply(buffer, { asSticker: true, ...exif })
                } else if (m.mentions[0]) {
                    m.reply("wait")
                    let url = await hinata.profilePictureUrl(m.mentions[0], "image");
                    m.reply(url, { asSticker: true, ...setting.Exif })
                } else if (/(https?:\/\/.*\.(?:png|jpg|jpeg|webp|mov|mp4|webm|gif))/i.test(m.text)) {
                    m.reply("wait")
                    m.reply(Func.isUrl(m.text)[0], { asSticker: true, ...setting.Exif })
                } else {
                    m.reply(`Balas/Reply media dengan caption: ${prefix + command}`)
                }
            }
            break
            case "toimg": case "toimage": {
                let { webp2mp4File } = (await import("../lib/sticker.js"))
                if (!/webp/i.test(quoted.mime)) return m.reply(`Balas/Reply Sticker dengan caption: ${prefix + command}`)
                if (quoted.isAnimated) {
                    let media = await webp2mp4File((await quoted.download()))
                    await m.reply(media)
                }
                let media = await quoted.download()
                await m.reply(media, { mimetype: "image/png" })
            }
            break

            // downloader
            case "tiktok": case "tt": {
                if (!/https?:\/\/(www\.|v(t|m|vt)\.|t\.)?tiktok\.com/i.test(m.text)) return m.reply(`Kirim perintah: ${prefix + command} link`)
                await m.reply("wait")
                await tiktok(Func.isUrl(m.text)[0]).then(req => {
                    m.reply(req.no_watermark, { caption: req.title })
                }).catch((error) => {
                    m.reply("error")
                })
            }
            break

            // group
            case "hidetag": case "ht": {
                if (!m.isGroup) return m.reply("group")
                if (!m.isAdmin) return m.reply("admin")
                let mentions = m.metadata.participants.map(a => a.id)
                let mod = await hinata.cMod(m.from, quoted, /hidetag|tag|ht|h|totag/i.test(quoted.body.toLowerCase()) ? quoted.body.toLowerCase().replace(prefix + command, "") : quoted.body)
                hinata.sendMessage(m.from, { forward: mod, mentions }, { quoted: m })
            }
            break
            case "add": {
                if (!m.isGroup) return m.reply("group")
                if (!m.isAdmin) return m.reply("admin")
                if (!m.isBotAdmin) return m.reply("botAdmin")
                let users = m.mentions.length !== 0 ? m.mentions.slice(0, 2) : m.isQuoted ? [m.quoted.sender] : m.text.split(",").map(v => v.replace(/[^0-9]/g, '') + "@s.whatsapp.net").slice(0, 2)
                if (users.length == 0) return m.reply('Hm')
                await hinata.groupParticipantsUpdate(m.from, users, "add")
                    .then(async (res) => {
                        for (let i of res) {
                            if (i.status == 403) {
                                let node = getBinaryNodeChildren(i.content, "add_request")
                                await m.reply(`Tidak dapat menambahkan @${i.jid.split('@')[0]}, kirim undangan...`)
                                let url = await hinata.profilePictureUrl(m.from, "image").catch(_ => "https://lh3.googleusercontent.com/proxy/esjjzRYoXlhgNYXqU8Gf_3lu6V-eONTnymkLzdwQ6F6z0MWAqIwIpqgq_lk4caRIZF_0Uqb5U8NWNrJcaeTuCjp7xZlpL48JDx-qzAXSTh00AVVqBoT7MJ0259pik9mnQ1LldFLfHZUGDGY=w1200-h630-p-k-no-nu")
                                await hinata.sendGroupV4Invite(i.jid, m.from, node[0]?.attrs?.code || node.attrs.code, node[0]?.attrs?.expiration || node.attrs.expiration, m.metadata.subject, url, "Undangan untuk bergabung dengan Grup WhatsApp saya")
                            }
                            else if (i.status == 409) return m.reply(`@${i.jid?.split('@')[0]} sudah ada di grup ini`)
                            else m.reply(Func.format(i))
                        }
                    })
            }
            break
            case "linkgroup": case "linkgrup": case "linkgc": {
                if (!m.isGroup) return m.reply("group")
                if (!m.isAdmin) return m.reply("admin")
                if (!m.isBotAdmin) return m.reply("botAdmin")
                await m.reply("https://chat.whatsapp.com/" + (await hinata.groupInviteCode(m.from)))
            }
            break

            // owner
            case "mode": {
                if (!m.isOwner) return m.reply("owner")
                if (setting.options.public) {
                    setting.options.public = false
                    m.reply('Berhasil mengubah mode Public > Self')
                } else {
                    setting.options.public = true
                    m.reply('Berhasil mengubah mode Self > Public')
                }
            }
            break
            /*case "setpp": case "setprofile": {
                const media = await quoted.download()
                if (m.isOwner && !m.isGroup) {
                    if (/full/i.test(m.text)) await hinata.setProfilePicture(hinata?.user?.id, media, "full")
                    else if (/(de(l)?(ete)?|remove)/i.test(m.text)) await hinata.removeProfilePicture(hinata.decodeJid(hinata?.user?.id))
                    else await hinata.setProfilePicture(hinata?.user?.id, media, "normal")
                } else if (m.isGroup && m.isAdmin && m.isBotAdmin) {
                    if (/full/i.test(m.text)) await hinata.setProfilePicture(m.from, media, "full")
                    else if (/(de(l)?(ete)?|remove)/i.test(m.text)) await hinata.removeProfilePicture(m.from)
                    else await hinata.setProfilePicture(m.from, media, "normal")
                }
            }
            break*/
            case "rvo": {
            	if (!m.isOwner) return
                if (!quoted.msg.viewOnce) return m.reply(`Balas/Reply ViewOnce dengan caption: ${prefix + command}`)
                quoted.msg.viewOnce = false
                await hinata.sendMessage(m.from, { forward: quoted }, { quoted: m })
            }
            break

            default:

            // eval
            if (["x", "eval"].some(a => m.body?.toLowerCase()?.startsWith(a))) {
                if (!m.isOwner) return m.reply("owner")
                let evalCmd = ""
                try {
                    evalCmd = /await/i.test(m.text) ? eval("(async() => { " + m.text + " })()") : eval(m.text)
                } catch (e) {
                    evalCmd = e
                }
                new Promise(async (resolve, reject) => {
                    try {
                        resolve(evalCmd);
                    } catch (err) {
                        reject(err)
                    }
                })
                    ?.then((res) => m.reply(format(res)))
                    ?.catch((err) => m.reply(format(err)))
            }

            // exec
            if (["$", "exec"].some(a => m.body?.toLowerCase()?.startsWith(a))) {
                if (!m.isOwner) return m.reply("owner")
                try {
                    exec(m.text, async (err, stdout) => {
                        if (err) return m.reply(Func.format(err))
                        if (stdout) return m.reply(Func.format(stdout))
                    })
                } catch (e) {
                    m.reply(Func.format(e))
                }
            }

        }
    } catch (e) {
        m.reply(format(e))
    }
}
