using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using SpacetimeDB;
using SpacetimeDB.Types;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

public class GameManager : MonoBehaviour
{
    const string SERVER_URL = "http://localhost:3000";
    const string MODULE_NAME = "chat-system";

    public GameObject ChatPanel, TextObject;
    public TMP_InputField ChatInput;

    public List<Message> messageList = new List<Message>();

    public static GameManager Instance { get; private set; }
    public static Identity LocalIdentity { get; private set; }
    public static DbConnection Client { get; private set; }

    private void Start()
    {
        Instance = this;
        Application.targetFrameRate = 60;

        var builder = DbConnection.Builder()
            .WithUri(SERVER_URL)
            .WithModuleName(MODULE_NAME)
            .OnConnect((conn, identity, token) =>
            {
                AuthToken.SaveToken(token);
                LocalIdentity = identity;
                Client.SubscriptionBuilder()
                    .OnApplied(OnSubscriptionsApplied)
                    .SubscribeToAllTables();
                Debug.Log("Connected to STDB w/ identity: " + LocalIdentity);
            });

        if (AuthToken.Token != "")
        {
            builder = builder.WithToken(AuthToken.Token);
        }

        Client = builder.Build();

        Client.Db.WorldMessage.OnInsert += OnWorldMessageInsert;
        Client.Db.WorldMessage.OnUpdate += OnWorldMessageUpdate;
        Client.Db.WorldMessage.OnDelete += OnWorldMessageDelete;
    }

    private void OnSubscriptionsApplied(SubscriptionEventContext obj)
    { 
        var sortedMessages = obj.Db.WorldMessage.Iter().ToList().OrderBy(m => m.Id).ToList();
        foreach (var message in sortedMessages)
        {
            Message newMessage = new Message();
            newMessage.message = message;
            newMessage.textObject = Instantiate(TextObject, ChatPanel.transform);
            newMessage.textObject.GetComponentInChildren<TMP_Text>().text = ProcessMessage(message, obj.Db);
            messageList.Add(newMessage);
        }
    }

    private void Update()
    {
        if (ChatInput.text != "" && Input.GetKeyDown(KeyCode.Return))
        {
            Client.Reducers.SendMessage(ChatInput.text);
            ChatInput.text = "";
        }
    }

    private void OnWorldMessageInsert(EventContext context, WorldMessage row)
    {
        if (context.Event is Event<Reducer>.SubscribeApplied) return;

        Message newMessage = new Message();
        newMessage.message = row;
        newMessage.textObject = Instantiate(TextObject, ChatPanel.transform);
        newMessage.textObject.GetComponentInChildren<TMP_Text>().text = ProcessMessage(row, context.Db);
        messageList.Add(newMessage);
    }

    private void OnWorldMessageUpdate(EventContext context, WorldMessage oldrow, WorldMessage newrow)
    {
        messageList[messageList.FindIndex(m => m.message == oldrow)]
            .textObject.GetComponentInChildren<TMP_Text>().text = ProcessMessage(newrow, context.Db);
    }

    private void OnWorldMessageDelete(EventContext context, WorldMessage row)
    {
        var index = messageList.FindIndex(m => m.message.Id == row.Id);
        foreach(Transform go in messageList[index].textObject.transform) Destroy(go);
        Destroy(messageList[index].textObject);
        messageList.Remove(messageList[index]);
    }

    private string ProcessMessage(WorldMessage row, RemoteTables db)
    {
        return $"[{DateTime.UnixEpoch.AddSeconds(row.Timestamp).ToString("HH:mm")}] {db.Player.Identity.Find(row.Sender)!.Name}: {row.Text}";
    }
}

[System.Serializable]
public class Message
{
    public WorldMessage message;
    public GameObject textObject;
}
