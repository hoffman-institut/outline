import type { Client } from "@shared/types";
import env from "@server/env";
import logger from "@server/logging/Logger";
import type { EmailProps } from "./BaseEmail";
import BaseEmail, { EmailMessageCategory } from "./BaseEmail";
import Body from "./components/Body";
import Button from "./components/Button";
import Callout from "./components/Callout";
import CopyableCode from "./components/CopyableCode";
import EmailTemplate from "./components/EmailLayout";
import EmptySpace from "./components/EmptySpace";
import Footer from "./components/Footer";
import Header from "./components/Header";
import Heading from "./components/Heading";
import Note from "./components/Note";

type Props = EmailProps & {
  token?: string;
  teamUrl: string;
  client: Client;
  verificationCode?: string;
};

/**
 * Email sent to a user when they request a magic sign-in link.
 */
export default class SigninEmail extends BaseEmail<Props, void> {
  protected get category() {
    return EmailMessageCategory.Authentication;
  }

  protected subject({ token }: Props) {
    return token
      ? this.t("Magic Sign-in Link")
      : this.t("Sign in verification code");
  }

  protected preview(): string {
    return this.t("Here’s your link to sign in to {{ appName }}.", {
      appName: env.APP_NAME,
    });
  }

  protected renderAsText({
    token,
    teamUrl,
    client,
    verificationCode,
  }: Props): string {
    if (token) {
      return `
${this.t("Use the link below to sign in")}:

${this.signinLink(teamUrl, token, client)}

${this.t("The link is valid for 10 minutes.")} ${this.t("Open it on the same device and network you requested it from. It does not work from a different IP address.")}

${this.t("If the link has expired, request a new one on the sign-in page")}: ${teamUrl}
`;
    }

    return `
${this.t("Enter this verification code")}: ${verificationCode}

${this.t("The code is valid for 10 minutes.")}

${this.t("If the code expired you can request a new one from your team’s sign-in page at")}: ${teamUrl}
`;
  }

  protected render({ token, client, teamUrl, verificationCode }: Props) {
    if (env.isDevelopment) {
      if (token) {
        logger.debug(
          "email",
          `Sign-In link: ${this.signinLink(teamUrl, token, client)}`
        );
      }
      if (verificationCode) {
        logger.debug("email", `Verification code: ${verificationCode}`);
      }
    }

    const host = teamUrl.replace(/^https?:\/\//, "");
    const ignoreNote = (
      <Note>
        {this.t(
          "If you did not request to sign in, just ignore this email. No one can sign in with your email address without this link or code."
        )}
      </Note>
    );

    return (
      <EmailTemplate
        previewText={this.preview()}
        goToAction={
          token
            ? {
                url: this.signinLink(teamUrl, token, client),
                name: this.t("Sign In"),
              }
            : undefined
        }
      >
        <Header />

        {token ? (
          <Body>
            <Heading>{this.t("Wiki sign-in")}</Heading>
            <p>
              {this.t(
                "Hi! Here is your link to sign in to the Hoffman Institute corporate wiki. Click the button and you are in."
              )}
            </p>
            <p>
              <Button href={this.signinLink(teamUrl, token, client)}>
                {this.t("Sign in to the wiki")}
              </Button>
            </p>
            <EmptySpace height={8} />
            <Callout
              title={this.t("About this link")}
              items={[
                this.t("The link is valid for 10 minutes."),
                this.t(
                  "Open it on the same device and network you requested it from. It does not work from a different IP address."
                ),
                <>
                  {this.t(
                    "If the link has expired, request a new one on the sign-in page"
                  )}
                  : <a href={teamUrl}>{host}</a>.
                </>,
              ]}
            />
            {ignoreNote}
          </Body>
        ) : (
          <Body>
            <Heading>{this.t("Sign-in Code")}</Heading>
            <p>
              {this.t(
                "Enter this code on your team’s sign-in page to continue."
              )}
            </p>
            <CopyableCode>{verificationCode}</CopyableCode>
            <Callout
              title={this.t("About this code")}
              items={[
                this.t("The code is valid for 10 minutes."),
                <>
                  {this.t(
                    "If the code expired you can request a new one from your team’s sign-in page at"
                  )}
                  : <a href={teamUrl}>{host}</a>.
                </>,
              ]}
            />
            {ignoreNote}
          </Body>
        )}
        <Footer />
      </EmailTemplate>
    );
  }

  private signinLink(teamUrl: string, token: string, client: Client): string {
    return `${teamUrl}/auth/email.callback?token=${token}&client=${client}`;
  }
}
