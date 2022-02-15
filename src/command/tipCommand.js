/**
 * A Telegram Command. Transfer sends coin to username.
 * To return current wallets address do /tip <username>
 * @module Commands/tip
 */
const Command = require('../base/command');
const STATUS = require('../status');
const Telegraf = require('telegraf');
const { STATUS_CODES } = require('http');

class TransferCommand extends Command {
	enabled = true;

	get name() {
        return "tip";
    }
	
	get description() {
		return "Tip coin to another user. To set default tip value go to /set tip <amount> (usages : /tip <username>) or you can custom tip /tip <username> <custom_amount>";
	}

	auth(ctx) {
		return ctx.appRequest.is.group;
	}

	async run(ctx) {
		if(ctx.test)  return;
		
		if(ctx.appRequest.args.length <= 0) {
            return ctx.reply(`Missing arguments\n${this.description}`);
        }

		const Wallet = this.loadModel("Wallet");
		const User = this.loadModel("User");
		const Meta = this.loadModel("Meta");

		const sender = await User.findById(ctx.from.id);
		if(!sender || sender === STATUS.ERROR_ACCOUNT_NOT_EXISTS){
			return ctx.telegram.sendMessage(ctx.from.id,`User not avaliable please /create`);
		}
		
		if(!('wallet' in sender) || sender === STATUS.ERROR_WALLET_NOT_AVALIABLE) {
			return ctx.telegram.sendMessage(ctx.from.id,`No wallet avaliable`);
		}

		let wallet = await Wallet.syncBalance(ctx, sender.wallet, this.Coin);
		let username = ctx.appRequest.args[0].trim();
		if(username.startsWith("@")) {
			username = username.substr(1);
		}
		const user = await User.findByUsername(username);
		if(!user || user === STATUS.ERROR_ACCOUNT_NOT_EXISTS) {
			return ctx.reply("User account is not avaliable " + ctx.appRequest.args[0] + " /create to create an account");
		}
		if(!user || !('wallet' in user) || user === STATUS.ERROR_WALLET_NOT_AVALIABLE) {
			return ctx.reply("User wallet is not avaliable");
		}
		let tipAmount;
		let amount;
		if(ctx.appRequest.args.length > 1) {
			tipAmount = ctx.appRequest.args[1];
			amount = this.Coin.parse(tipAmount)
		} else {
			tipAmount = await this.loadModel('Setting').findByFieldAndUserId('tip', ctx.from.id);
			if(tipAmount && 'tip' in tipAmount) {
				amount = tipAmount.tip;
			}
		}

		if(!tipAmount || tipAmount < 1){
			tipAmount = 10;
			amount = this.Coin.parse(tipAmount)
		}
		
		if(amount > parseFloat(wallet.unlock)) {
			return ctx.telegram.sendMessage(ctx.from.id,'Insufficient fund');	
		}

		if(sender.tip_submit !== 'enabled') {

			const trx = await this.Coin.transfer(ctx.from.id, wallet.wallet_id, user.wallet.address, amount, true);
			if('error' in trx) {
				return ctx.reply(trx.error);
			}

			const uuid = await Meta.getId(ctx.from.id, trx.tx_metadata);

			return ctx.telegram.sendMessage(ctx.from.id,`
				** Transaction Details **

				From: 
				${wallet.address}
				
				To: 
				@${user.username}
				
				Amount : ${this.Coin.format(trx.amount)}
				Fee : ${this.Coin.format(trx.fee)}
				Trx Meta ID: ${uuid}
				Trx Expiry: ${global.config.rpc.metaTTL} seconds
				Current Unlock Balance : ${this.Coin.format(wallet.balance)}

				To proceed with transaction run
				/submit ${uuid} 
			`);

		} else {
			const trx = await this.Coin.transfer(ctx.from.id, wallet.wallet_id, user.wallet.address, amount, false);
			if('error' in trx) {
				return ctx.reply(trx.error);
			}

			const balance = parseInt(wallet.balance) - parseInt(trx.amount) - parseInt(trx.fee);

			return ctx.telegram.sendMessage(ctx.from.id,`
				** Transaction Details **

				From: 
				${wallet.address}
				
				To: 
				@${user.username}
				
				Amount : ${this.Coin.format(trx.amount)}
				Fee : ${this.Coin.format(trx.fee)}
				Trx Hash: ${trx.tx_hash}
				Current Balance : ${this.Coin.format(balance)}
			`);
		}
	}
}
module.exports = TransferCommand;
