import * as React from "react";
import env from "@server/env";
import { can } from "@server/policies";
import type { EmailProps } from "./BaseEmail";
import BaseEmail, { EmailMessageCategory } from "./BaseEmail";
import Body from "./components/Body";
import Button from "./components/Button";
import Callout from "./components/Callout";
import EmailTemplate from "./components/EmailLayout";
import EmptySpace from "./components/EmptySpace";
import Footer from "./components/Footer";
import Header from "./components/Header";
import Heading from "./components/Heading";
import Note from "./components/Note";

type Props = EmailProps & {
  name: string;
  actorName: string;
  actorEmail: string | null;
  teamName: string;
  teamUrl: string;
};

/**
 * Email sent to an external user when an admin sends them an invite.
 */
export default class InviteEmail extends BaseEmail<Props, void> {
  protected get category() {
    return EmailMessageCategory.Invitation;
  }

  protected subject({ actorName, teamName }: Props) {
    return this.t(
      "{{ actorName }} invited you to join {{ teamName }}’s workspace",
      {
        actorName,
        teamName,
      }
    );
  }

  protected preview() {
    return this.t(
      "{{ appName }} is a place for your team to build and share knowledge.",
      {
        appName: env.APP_NAME,
      }
    );
  }

  protected replyTo({ notification }: Props) {
    if (notification?.user && notification.actor?.email) {
      if (can(notification.user, "readEmail", notification.actor)) {
        return notification.actor.email;
      }
    }
    return;
  }

  protected renderAsText({ actorName, actorEmail, teamUrl }: Props): string {
    return `
${this.t("You're invited to the wiki")}

${this.t("Hi!")} ${actorName} ${actorEmail ? `(${actorEmail})` : ""} ${this.t("invites you to the Hoffman Institute corporate wiki. It is home to our instructions, policies and everything you need to know about working in the team.")}

${this.t("Open the wiki")}: ${teamUrl}

${this.t("Click the button and enter your work email to get a sign-in link. No password needed.")}
`;
  }

  protected render({ actorName, teamUrl }: Props) {
    const inviteLink = `${teamUrl}?ref=invite-email`;

    return (
      <EmailTemplate previewText={this.preview()}>
        <Header />

        <Body>
          <Heading>{this.t("You're invited to the wiki")}</Heading>
          <p>
            {this.t("Hi!")} <strong>{actorName}</strong>{" "}
            {this.t(
              "invites you to the Hoffman Institute corporate wiki. It is home to our instructions, policies and everything you need to know about working in the team."
            )}
          </p>
          <p>
            <Button href={inviteLink}>{this.t("Open the wiki")}</Button>
          </p>
          <EmptySpace height={8} />
          <Callout
            title={this.t("How to sign in")}
            items={[
              this.t(
                "Click the button and enter your work email to get a sign-in link. No password needed."
              ),
              this.t(
                "Open the email with the link on the same device, then signing in works the first time."
              ),
            ]}
          />
          <Note>
            {this.t(
              "If this invitation reached you by mistake, just ignore this email."
            )}
          </Note>
        </Body>

        <Footer />
      </EmailTemplate>
    );
  }
}
