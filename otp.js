import { generateTOTP } from '@epic-web/totp'

// Paste your string here. It should start with "otpauth://totp/" and include a secret and other params
const otpString = `otpauth://totp/Example:alice@google.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&algorithm=SHA1&digits=6&period=30`

const otpUri = new URL(otpString)
const { secret, algorithm, digits, period } = Object.fromEntries(
	otpUri.searchParams.entries(),
)

const { otp } = generateTOTP({
	secret,
	algorithm,
	digits,
	period,
})

console.log(otp)
