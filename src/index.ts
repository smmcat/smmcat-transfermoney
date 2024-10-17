import { Context, Schema, h } from 'koishi'
import type { } from 'koishi-plugin-monetary'
export const name = 'smmcat-transfermoney'


export interface Config {
  atQQ: boolean,
  currency: string
}

export const Config: Schema<Config> = Schema.object({
  atQQ: Schema.boolean().default(false).description('回复消息附带 @发送者 [兼容操作]'),
  currency: Schema.string().default('积分').description('积分名')
})
export const inject = ['monetary', 'database'];
export function apply(ctx: Context, config: Config) {
  // write your plugin here

  ctx
    .command('转账 <num:number> <uId:text>')
    .userFields(['id']).action(async ({ session }, num, uId) => {

      let at = ''
      if (config.atQQ) {
        at = `<at id="${session.userId}" />`
      }

      if (num < 0) {
        await session.send(`需要向目标转帐的${config.currency}不能小于1`);
        return
      }

      const uatList = h.select(uId, 'at').map(item => item.attrs.id).filter(item => item && item !== session.userId)
      const atList = [...new Set(uatList)];

      const uid = session.user.id
      // 获取自己的余额
      const [myData] = await ctx.database.get('monetary', { uid })
      // 规避初始化
      if (!myData) {
        await ctx.monetary.gain(uid, 0);
        await session.send(at + `你还没有任何${config.currency}`);
        return
      }

      num = Math.ceil(num)

      // 获取目标余额
      const actionInfoList = []
      const dict = { ok: 0, err: [] }
      const eventList = atList.map((item) => {
        return new Promise(async (resolve, rejects) => {
          const [data] = await ctx.database.get('binding', { pid: item, platform: session.platform })
          if (data) {
            const [anyData] = await ctx.database.get('monetary', { uid: data.aid })
            if (!anyData) {
              await ctx.monetary.gain(data.aid, 0)
            }
            actionInfoList.push({
              userId: item,
              uid: data.aid,
              balance: anyData ? anyData.value : 0
            })
            dict.ok++
          } else {
            dict.err.push(item)
          }

          resolve(true)
        })
      })
      await Promise.all(eventList)

      if (dict.err.length) {
        await session.send(at + `数据库中 ${dict.err.map(item => h.at(item)).join('、')} 并未存在任何数据，因此获取失败。`)
      }

      if (!actionInfoList.length) {
        await session.send(at + '您并未选择任何有效的转账目标')
        return
      }

      if (myData.value < (num * actionInfoList.length)) {
        await session.send(at + `您的当前不够支付 ${num * actionInfoList.length} ${config.currency}。\n您目前现有 ${myData.value} ${config.currency}`)
        return
      }

      const accountMsg = ` 进入结算转账流程：\n----------------------------\n` +
        `${actionInfoList.map(item => {
          return '\u200b\n' + h.at(item.userId) + ` 当前持有：${item.balance}\n预计获得：${num}\n获得后的${config.currency}：${item.balance + num}`
        }).join('\n\n')}` +
        `\n----------------------------\n` +
        `您当前${config.currency}持有：${myData.value}\n` +
        `您共计需要${config.currency}转账：${num * actionInfoList.length}\n[!] 确认是否需要转账 (10秒内发送 "是" 否则取消流程)`

      await session.send(at + accountMsg)
      const action = await session.prompt(10000);

      if (action !== '是') {
        await session.send(at + '已取消转账流程')
        return
      }

      await ctx.monetary.cost(uid, num * actionInfoList.length);
      const payEventList = actionInfoList.map(item => {
        return new Promise(async (resolve, reject) => {
          await ctx.monetary.gain(item.uid, num);
          resolve(true)
        })
      })

      await Promise.all(payEventList);
      await session.send(at + `转账成功。失去${num * actionInfoList.length}${config.currency}`)
    })

  ctx
    .command('转账平均 <num:number> <uId:text>')
    .userFields(['id']).action(async ({ session }, num, uId) => {

      let at = ''
      if (config.atQQ) {
        at = `<at id="${session.userId}" />`
      }

      if (num < 0) {
        await session.send(`需要向目标转帐的${config.currency}总不能啥也不给吧！`);
        return
      }

      const uatList = h.select(uId, 'at').map(item => item.attrs.id).filter(item => item && item !== session.userId)
      const atList = [...new Set(uatList)];

      const uid = session.user.id
      // 获取自己的余额
      const [myData] = await ctx.database.get('monetary', { uid })
      // 规避初始化
      if (!myData) {
        await ctx.monetary.gain(uid, 0);
        await session.send(at + `你还没有任何${config.currency}`);
        return
      }

      num = Math.ceil(num)

      // 获取目标余额
      const actionInfoList = []
      const dict = { ok: 0, err: [] }
      const eventList = atList.map((item) => {
        return new Promise(async (resolve, rejects) => {
          const [data] = await ctx.database.get('binding', { pid: item, platform: session.platform })
          if (data) {
            const [anyData] = await ctx.database.get('monetary', { uid: data.aid })
            if (!anyData) {
              await ctx.monetary.gain(data.aid, 0)
            }
            actionInfoList.push({
              userId: item,
              uid: data.aid,
              balance: anyData ? anyData.value : 0
            })
            dict.ok++
          } else {
            dict.err.push(item)
          }

          resolve(true)
        })
      })
      await Promise.all(eventList)

      if (dict.err.length) {
        await session.send(at + `数据库中 ${dict.err.map(item => h.at(item)).join('、')} 并未存在任何数据，因此获取失败。`)
      }

      if (!actionInfoList.length) {
        await session.send(at + '您并未选择任何有效的转账目标')
        return
      }

      if (num < actionInfoList.length) {
        await session.send(at + `平均转账的 ${config.currency} 可不能小于转账的人数啊！`)
        return
      }


      if (num % actionInfoList.length) {
        const beforNum = num;
        num = num - num % actionInfoList.length;
        await session.send(at + `由于不支持平摊小数转账，您的平均转账将进行化整操作。\n由 ${beforNum} ${config.currency}，改为 ${num} ${config.currency}`);
      }
      const averageNum = num / actionInfoList.length

      if (myData.value < num) {
        await session.send(at + `您的当前不够支付 ${num} ${config.currency}。\n您目前现有 ${myData.value} ${config.currency}`)
        return
      }

      const accountMsg = ` 进入结算转账流程：\n----------------------------\n` +
        `${actionInfoList.map(item => {
          return '\u200b\n' + h.at(item.userId) + ` 当前持有：${item.balance}\n预计获得：${averageNum}\n获得后的${config.currency}：${item.balance + averageNum}`
        }).join('\n\n')}` +
        `\n----------------------------\n` +
        `您当前${config.currency}持有：${myData.value}\n` +
        `您共计需要${config.currency}转账：${num}\n[!] 确认是否需要转账 (10秒内发送 "是" 否则取消流程)`

      await session.send(at + accountMsg)
      const action = await session.prompt(10000);

      if (action !== '是') {
        await session.send(at + '已取消转账流程')
        return
      }

      await ctx.monetary.cost(uid, num);
      const payEventList = actionInfoList.map(item => {
        return new Promise(async (resolve, reject) => {
          await ctx.monetary.gain(item.uid, averageNum);
          resolve(true)
        })
      })

      await Promise.all(payEventList);
      await session.send(at + `转账平均分配成功。失去${num}${config.currency}`)
    })

  ctx
    .command('转账随机 <num:number> <uId:text>')
    .userFields(['id']).action(async ({ session }, num, uId) => {

      let at = ''
      if (config.atQQ) {
        at = `<at id="${session.userId}" />`
      }

      if (num < 0) {
        await session.send(`需要向目标转帐的${config.currency}总不能啥也不给吧！`);
        return
      }

      const uatList = h.select(uId, 'at').map(item => item.attrs.id).filter(item => item && item !== session.userId)
      const atList = [...new Set(uatList)];

      const uid = session.user.id
      // 获取自己的余额
      const [myData] = await ctx.database.get('monetary', { uid })
      // 规避初始化
      if (!myData) {
        await ctx.monetary.gain(uid, 0);
        await session.send(at + `你还没有任何${config.currency}`);
        return
      }

      num = Math.ceil(num)

      // 获取目标余额
      const actionInfoList = []
      const dict = { ok: 0, err: [] }
      const eventList = atList.map((item) => {
        return new Promise(async (resolve, rejects) => {
          const [data] = await ctx.database.get('binding', { pid: item, platform: session.platform })
          if (data) {
            const [anyData] = await ctx.database.get('monetary', { uid: data.aid })
            if (!anyData) {
              await ctx.monetary.gain(data.aid, 0)
            }
            actionInfoList.push({
              userId: item,
              uid: data.aid,
              balance: anyData ? anyData.value : 0
            })
            dict.ok++
          } else {
            dict.err.push(item)
          }

          resolve(true)
        })
      })
      await Promise.all(eventList)

      if (dict.err.length) {
        await session.send(at + `数据库中 ${dict.err.map(item => h.at(item)).join('、')} 并未存在任何数据，因此获取失败。`)
      }

      if (!actionInfoList.length) {
        await session.send(at + '您并未选择任何有效的转账目标')
        return
      }

      if (num < actionInfoList.length) {
        await session.send(at + `随机转账的 ${config.currency} 可不能小于转账的人数啊！`)
        return
      }

      if (myData.value < num) {
        await session.send(at + `您的当前不够支付 ${num} ${config.currency}。\n您目前现有 ${myData.value} ${config.currency}`)
        return
      }

      const resultList = tool.splitValue(num, actionInfoList.length)
      const maxIndex = tool.findMaxIndex(resultList)

      await session.send(at + `您目前打算支付 ${num} ${config.currency}用于随机分配给 ${actionInfoList.length} 位人员，结果最后公布。\n请问是否同意 (10秒内发送 "是" 否则取消流程)`)
      const action = await session.prompt(10000);
      if (action !== '是') {
        await session.send(at + '已取消转账流程')
        return
      }

      if (action !== '是') {
        await session.send(at + '已取消转账流程')
        return
      }

      await ctx.monetary.cost(uid, num);
      const msgArr = []
      const payEventList = actionInfoList.map((item, index) => {
        return new Promise(async (resolve, reject) => {
          await ctx.monetary.gain(item.uid, resultList[index]);
          msgArr.push(`\u200b\n` + h.at(item.userId) + ` 获得了 ${resultList[index]}${config.currency}！` +
            `${index == maxIndex ? ' [运气王]' : ''}`)
          resolve(true)
        })
      })

      await Promise.all(payEventList);
      await session.send(at + `转账随机分配成功。\n\n${msgArr.join('\n')}\n\n你此次一共失去${num}${config.currency}\n目前剩余${config.currency} ${myData.value - num}`)
    })

  ctx
    .command(`查看${config.currency}`)
    .userFields(['id']).action(async ({ session }) => {

      let at = ''
      if (config.atQQ) {
        at = `<at id="${session.userId}" />`
      }

      const uid = session.user.id
      const [data] = await ctx.database.get('monetary', { uid })

      if (!data) await ctx.monetary.gain(uid, 0)
      return `你的${config.currency}为 ${data ? data.value : 0}`
    })
    
  const tool = {
    splitValue(value, length) {
      let result = [];
      for (let i = 0; i < length - 1; i++) {
        let random = Math.floor(Math.random() * (value - (length - i - 1))) + 1;
        result.push(random);
        value -= random;
      }
      result.push(value);
      result.sort(() => Math.random() - 0.5);
      return result;
    },
    findMaxIndex(arr) {
      let max = arr[0];
      let maxIndex = 0;

      for (let i = 1; i < arr.length; i++) {
        if (arr[i] > max) {
          max = arr[i];
          maxIndex = i;
        }
      }
      return maxIndex;
    }
  }
}
