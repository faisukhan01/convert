// Command ghlctl is the operator CLI for the GoHighLevel stack: inspect
// contacts, pipelines and conversations, manage tags and opportunities, and
// smoke-test the API credentials — all from the terminal.
//
//	$ ghlctl whoami
//	$ ghlctl contact get <id>
//	$ ghlctl tag add <contactId> hot-lead
//	$ ghlctl pipeline list
//	$ ghlctl opp move <opportunityId> <stageId>
//	$ ghlctl sms send <contactId> "Your roof estimate is ready"
//
// Configuration comes from the environment (same as the engine):
// GHL_ACCESS_TOKEN, GHL_LOCATION_ID, GHL_API_BASE.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/faisukhan01/convert/services/engine-go/internal/ghlapi"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	cmd := os.Args[1]
	args := os.Args[2:]

	token := os.Getenv("GHL_ACCESS_TOKEN")
	location := os.Getenv("GHL_LOCATION_ID")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client := ghlapi.NewClient(token, ghlapi.WithLocationID(location))

	var err error
	switch cmd {
	case "whoami", "status":
		out := map[string]any{
			"tokenConfigured": token != "",
			"token":           client.MaskedToken(),
			"locationId":      location,
			"apiBase":         os.Getenv("GHL_API_BASE"),
		}
		if token != "" {
			if pipelines, perr := client.ListPipelines(ctx); perr == nil {
				out["pipelines"] = len(pipelines)
				out["apiReachable"] = true
			} else {
				out["apiReachable"] = false
				out["error"] = perr.Error()
			}
		}
		printJSON(out)

	case "contact":
		err = contactCmd(ctx, client, args)
	case "tag":
		err = tagCmd(ctx, client, args)
	case "note":
		err = noteCmd(ctx, client, args)
	case "pipeline":
		err = pipelineCmd(ctx, client, args)
	case "opp":
		err = oppCmd(ctx, client, args)
	case "sms":
		err = smsCmd(ctx, client, args)
	case "workflow":
		err = workflowCmd(ctx, client, args)
	case "task":
		err = taskCmd(ctx, client, args)
	case "help", "-h", "--help":
		usage()
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", cmd)
		usage()
		os.Exit(2)
	}

	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func contactCmd(ctx context.Context, c *ghlapi.Client, args []string) error {
	if len(args) < 2 {
		return fmt.Errorf("usage: contact get <id> | contact search <query> | contact create <email> <firstName> <lastName>")
	}
	switch args[0] {
	case "get":
		contact, err := c.GetContact(ctx, args[1])
		if err != nil {
			return err
		}
		printJSON(contact)
	case "search":
		contacts, err := c.SearchContacts(ctx, strings.Join(args[1:], " "), 1, 20)
		if err != nil {
			return err
		}
		printJSON(contacts)
	case "create", "upsert":
		if len(args) < 4 {
			return fmt.Errorf("usage: contact create <email> <firstName> <lastName>")
		}
		contact, err := c.UpsertContact(ctx, &ghlapi.Contact{
			Email:     args[1],
			FirstName: args[2],
			LastName:  args[3],
		})
		if err != nil {
			return err
		}
		printJSON(contact)
	default:
		return fmt.Errorf("unknown contact subcommand: %s", args[0])
	}
	return nil
}

func tagCmd(ctx context.Context, c *ghlapi.Client, args []string) error {
	if len(args) < 3 {
		return fmt.Errorf("usage: tag add <contactId> <tag...> | tag remove <contactId> <tag...>")
	}
	switch args[0] {
	case "add":
		return c.AddTags(ctx, args[1], args[2:]...)
	case "remove":
		return c.RemoveTags(ctx, args[1], args[2:]...)
	default:
		return fmt.Errorf("unknown tag subcommand: %s", args[0])
	}
}

func noteCmd(ctx context.Context, c *ghlapi.Client, args []string) error {
	if len(args) < 3 || args[0] != "add" {
		return fmt.Errorf("usage: note add <contactId> <text>")
	}
	note, err := c.AddNote(ctx, args[1], strings.Join(args[2:], " "))
	if err != nil {
		return err
	}
	printJSON(note)
	return nil
}

func pipelineCmd(ctx context.Context, c *ghlapi.Client, args []string) error {
	if len(args) > 0 && args[0] != "list" {
		return fmt.Errorf("usage: pipeline list")
	}
	pipelines, err := c.ListPipelines(ctx)
	if err != nil {
		return err
	}
	for _, p := range pipelines {
		fmt.Printf("%s  %s\n", p.ID, p.Name)
		for _, st := range p.Stages {
			fmt.Printf("    %s  %s\n", st.ID, st.Name)
		}
	}
	return nil
}

func oppCmd(ctx context.Context, c *ghlapi.Client, args []string) error {
	if len(args) < 2 {
		return fmt.Errorf("usage: opp get <id> | opp search [pipelineId] | opp move <id> <stageId> | opp status <id> <open|won|lost>")
	}
	switch args[0] {
	case "get":
		opp, err := c.GetOpportunity(ctx, args[1])
		if err != nil {
			return err
		}
		printJSON(opp)
	case "search":
		pipelineID := ""
		if len(args) > 1 {
			pipelineID = args[1]
		}
		opps, err := c.SearchOpportunities(ctx, pipelineID, "", 1, 50)
		if err != nil {
			return err
		}
		printJSON(opps)
	case "move":
		if len(args) < 3 {
			return fmt.Errorf("usage: opp move <id> <stageId>")
		}
		opp, err := c.MoveOpportunityStage(ctx, args[1], args[2])
		if err != nil {
			return err
		}
		printJSON(opp)
	case "status":
		if len(args) < 3 {
			return fmt.Errorf("usage: opp status <id> <open|won|lost>")
		}
		opp, err := c.SetOpportunityStatus(ctx, args[1], args[2])
		if err != nil {
			return err
		}
		printJSON(opp)
	default:
		return fmt.Errorf("unknown opp subcommand: %s", args[0])
	}
	return nil
}

func smsCmd(ctx context.Context, c *ghlapi.Client, args []string) error {
	if len(args) < 3 || args[0] != "send" {
		return fmt.Errorf("usage: sms send <contactId> <message>")
	}
	res, err := c.SendSMS(ctx, args[1], strings.Join(args[2:], " "))
	if err != nil {
		return err
	}
	printJSON(res)
	return nil
}

func workflowCmd(ctx context.Context, c *ghlapi.Client, args []string) error {
	if len(args) < 2 {
		return fmt.Errorf("usage: workflow list | workflow enroll <workflowId> <contactId> | workflow remove <workflowId> <contactId>")
	}
	switch args[0] {
	case "list":
		workflows, err := c.ListWorkflows(ctx)
		if err != nil {
			return err
		}
		for _, w := range workflows {
			fmt.Printf("%s  %-24s %s\n", w.ID, w.Name, w.Status)
		}
	case "enroll":
		if len(args) < 3 {
			return fmt.Errorf("usage: workflow enroll <workflowId> <contactId>")
		}
		return c.AddContactToWorkflow(ctx, args[1], args[2])
	case "remove":
		if len(args) < 3 {
			return fmt.Errorf("usage: workflow remove <workflowId> <contactId>")
		}
		return c.RemoveContactFromWorkflow(ctx, args[1], args[2])
	default:
		return fmt.Errorf("unknown workflow subcommand: %s", args[0])
	}
	return nil
}

func taskCmd(ctx context.Context, c *ghlapi.Client, args []string) error {
	if len(args) < 4 || args[0] != "add" {
		return fmt.Errorf("usage: task add <contactId> <title> <body>")
	}
	task, err := c.CreateTask(ctx, &ghlapi.Task{
		ContactID: args[1],
		Title:     args[2],
		Body:      strings.Join(args[3:], " "),
		Priority:  "normal",
	})
	if err != nil {
		return err
	}
	printJSON(task)
	return nil
}

func printJSON(v any) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func usage() {
	fmt.Print(`ghlctl — GoHighLevel operator CLI

Usage:
  ghlctl <command> [args]

Commands:
  whoami                      show token/location wiring and API reachability
  contact get <id>            fetch a contact
  contact search <query>      search contacts
  contact create <e> <f> <l>  upsert a contact (email, first, last)
  tag add <id> <tag...>       add tags to a contact
  tag remove <id> <tag...>    remove tags
  note add <id> <text>        add a note
  pipeline list               list pipelines and stages
  opp get <id>                fetch an opportunity
  opp search [pipelineId]     search opportunities
  opp move <id> <stageId>     move an opportunity to a stage
  opp status <id> <status>    set open|won|lost
  sms send <id> <message>     send an SMS to a contact
  workflow list               list workflows
  workflow enroll <wf> <id>   enroll a contact into a workflow
  workflow remove <wf> <id>   remove a contact from a workflow
  task add <id> <title> <b>   create a task

Environment:
  GHL_ACCESS_TOKEN   Private Integration Token (required for live calls)
  GHL_LOCATION_ID    Sub-account id
  GHL_API_BASE       Override API base (default: production)
`)
}
