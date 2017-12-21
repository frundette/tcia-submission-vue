<template>
  <div id="app">
    <form-wizard @on-complete="onComplete"
                 @on-loading="setLoading"
                 @on-validate="handleValidation"
                 @on-change="onChange"
                 color="#4fc6f9">

      <h2 slot="title">TCIA Submission Tool</h2>

      <!-- Tab 0 -->
      <tab-content title="Configure" icon="ti-map" :before-change="importSubmissionTemplate">
        <p>Fill out <a class="link" href='/src/assets/tcia-submission-template.xlsx'>this Excel template</a> and save it on your computer.
          Our software will use this information to determine which Collection your patients belong in,
          and to replace your patient IDs and dates with anonymized ones.</p>
        <p>After filling out the template, import the file: <input type="file" accept=".xlsx" id="templateFile" /></p>
      </tab-content>

      <!-- Tab 1 -->
      <tab-content title="Import Data" icon="ti-files" :before-change="copyIntoImportPipeline">
        <p>{{serverSpace}}</p>
        <p>Where is the DICOM data you’d like to submit?</p>
        <div class="center">
          <div style="float:left; width:2em">
            <button type="button" class="action-btn ti-arrow-up" v-on:click="upDirectoryClick">  Up </button>
          </div>
        </div>
        <v-jstree :data="fileSystem" allow-batch  v-on:dblclick.native="directoryDoubleClick" @item-click="directoryItemClick"></v-jstree>
      </tab-content>

      <!-- Tab 2 -->
      <tab-content title="Select Data" icon="ti-target" :before-change="anonymize">
        <div v-if="loadingWizard === false">
          <p>Choose which Studies or Patients to anonymize </p>
          <div class="center">
            <div style="float:left;">
              <button type="button" class="action-btn" v-on:click="selectAllClick"> {{ selectButtontext }} </button>
            </div>
            <v-jstree :data="inImportPipeline" class="anonymize-tree" show-checkbox multiple wholeRow="true" allowBatch="true"></v-jstree>
          </div>
        </div>
      </tab-content>

      <!-- Tab 3 -->
      <tab-content title="Review" icon="ti-export" :before-change="transferToTCIA">
        <p>Your data has been anonymized. A mapping manifest has been downloaded for your reference.</p>

        <ul class="anonymizedSummary">
          <li>
            <div class="ti-user"> Patients Processed: {{patientsAnonymized}}</div>
          </li>
          <li>
            <div class="ti-calendar"> Studies Processed: {{studiesAnonymized}}</div>
          </li>
          <li>
            <div class="ti-package"> Series Processed: {{seriesAnonymized}}</div>
          </li>
          <li>
            <div class="ti-na"><a target="_blank" class="link" href="/quarantines?p=1&s=2"> Quarantine Manager</a></div>
          </li>
        </ul>
      </tab-content>

      <!-- Tab 4 -->
      <tab-content title="Finished" icon="ti-check">
        <p>Thanks for submitting your data.</p>
        <p><a class="link" v-on:click="downloadAnonymizedManifest">Download the manifest</a> for your records.</p>
      </tab-content>

      <div class="loader" v-if="loadingWizard"></div>
    </form-wizard>
  </div>
</template>


<script>
  var parser = new DOMParser();

export default {
  name: 'app',
  beforeCreate() {
    this.$http.get('/login/ajax?username=admin&password=tcia').then(response => {
      this.loggedIn = true;
    }, response=>{
      alert("There was a problem communicating with CTP.");
    });
  },
  methods: {
    onChange: function(fromTab, toTab) {

      console.log('onChange from:' + fromTab + " to:" + toTab);
      switch(toTab) {
        case 0:  //Configure
          this.updateNextButtonText("Next");
          break;
        case 1:  //Import Data
          this.updateAvailableServerSpace();
          this.updateFileSystemTree(this.currentFileSystemPath);
          this.updateNextButtonText("Import");
          this.updateBackButtonText("Back");
          break;
        case 2:  //Select Data
          this.updateImportPipelineTree();
          this.updateNextButtonText("Anonymize");
          this.updateBackButtonText("Import More Data");
          break;
        case 3:  //Review
          //Get the list of images that have been anonymized
          this.updateAnonymizationNumbers();
          this.updateNextButtonText("Export");
          this.updateBackButtonText("Back");
          this.downloadMappingManifest();
          break;
        case 4:  //Finished
          this.updateNextButtonText("Finished");
          this.updateBackButtonText("Back");
          break;
        default:
          this.updateNextButtonText("Next");
      }
    },
    setLoading: function(value) {
      console.log("loading: " + value);
      this.loadingWizard = value;
    },
    onComplete: function(){
      console.log("Complete");
    },
    handleValidation: function(isValid, tabIndex){
      console.log('Tab: '+tabIndex+ ' valid: '+isValid)
    },
    importSubmissionTemplate: function(){
      var file = document.getElementById('templateFile').files[0];
      var fileFormData = new FormData();
      fileFormData.append('file', file);
      this.$http.post('/Collection', fileFormData).then(response =>{
        console.log("File submitted " + response.body);
      }, response => {
        alert("There was a problem importing the file.");
      });

      return true;
    },
    getSystemFileRoots: function(){
      this.$http.get('/Collection/getFileSystemRoots').then(response=>{
        console.log(response.body);
        var xml = parser.parseFromString(response.body, "text/xml");
        var json = this.rootsXmlToJson(xml);
        console.log(json);
        this.fileSystem = json.children;
      }, response=>{
        alert("Error retrieving the system file roots");
      });
    },
    updateFileSystemTree: function(path){

      if (!path) {   // is this logic the same on windows?
        this.getSystemFileRoots();
      }
      else {
        this.$http.get('/Collection/listFiles?dir=' + path).then(response => {
          var xml = parser.parseFromString(response.body, "text/xml");
          var json = this.fileSystemXmlToJson(xml);
          this.fileSystem = json.children;
        }, response => {
          alert("There was a problem retrieving directory information.");
        });
      }
    },
    rootsXmlToJson: function(xml){
      /* <roots><root name="/" desc="null"/></roots> */

      var obj = {};
      obj["children"] = [];
      var roots = xml.getElementsByTagName("root");

      for (var i=0; i<roots.length; i++){
        var rootObj = {};
        rootObj["type"] = "dir";
        rootObj["text"] = roots[i].getAttribute('name');
        rootObj["path"] = roots[i].getAttribute('name');
        rootObj["icon"] = "ti-folder";
        obj["children"].push(rootObj);
      }

      return obj;
    },
    fileSystemXmlToJson: function(xml, parent=""){

      /*
         <dir  name="Directory" parent="absolutePath">
           <dir name="sub-directory"/>
           <file name="file"/>
         </dir>
         */

      var obj={};

      if (xml.nodeType == 9){
        obj["children"] = [];
        for (var j = 0 ; j < xml.childNodes.length; j++){
          obj["children"].push(this.fileSystemXmlToJson(xml.childNodes.item(j)));
        }
      }
      else if (xml.attributes && xml.attributes.length > 0) {
        obj["type"] = xml.nodeName;
        obj["text"] = xml.getAttribute('name');
        if(xml.getAttribute('parent')) {
          obj["parent"] = xml.getAttribute('parent');
          obj["path"] = xml.getAttribute('parent');
          if (obj["path"] != "/")
            (obj["path"] += "/");
          obj["path"] += obj["text"];
        }
        else {
          obj["path"] = parent + "/" + obj["text"];
        }

        if (xml.nodeName == "dir") {
          obj["opened"] = true;
          obj["icon"] = "ti-folder";
          if (xml.hasChildNodes()) {
            obj["children"] = [];
            for (var i = 0; i < xml.childNodes.length; i++) {
              var item = xml.childNodes.item(i);
              if (item.nodeName == "dir" || item.nodeName == "file")
                obj["children"].push(this.fileSystemXmlToJson(item, obj["path"]));
            }
          }
        }
        else if (xml.nodeName == "file") {
          obj["icon"] = "ti-file"
        }
      }

      return obj;
    },
    copyIntoImportPipeline: function () {
      this.$http.get('/Collection/submitFile?file=' + this.currentFileSystemPath).then(response => {
        console.log("files submitted " + response.body);
        //this.updateImportPipelineTree();
      }, response => {
        alert("There was a problem copying the files into the import pipeline.")
      });
      return true;
    },
    updateImportPipelineTree: function(){
      this.$http.get('/Collection/listImport').then(response => {
        var xml = parser.parseFromString(response.body, "text/xml");
        var dirStorageXML = xml.getElementsByTagName("DicomFiles")[0].childNodes[0];
        var json = this.importPipelineXmlToJson(dirStorageXML);
        console.log(json);
        this.inImportPipeline = json.children;
      }, response =>{
        alert("There was a problem retrieving the list of files in the import pipeline.");
      })
    },
    importPipelineXmlToJson: function(xml, parent){
      var obj={};

      if (xml.nodeType == 9 || xml.nodeName == "DicomFiles"){
        obj["children"] = [];
        for (var j = 0 ; j < xml.childNodes.length; j++){
          obj["children"].push(this.importPipelineXmlToJson(xml.childNodes.item(j)));
        }
      }
      else if (xml.nodeName == "dir") {
        obj["type"] = xml.nodeName;
        obj["text"] = xml.getAttribute('name');
        obj["selected"] = true;
        if(xml.getAttribute('parent')) {
          obj["parent"] = xml.getAttribute('parent');
          obj["path"] = xml.getAttribute('parent');
          if (obj["path"] != "/")
            (obj["path"] += "/");
          obj["path"] += obj["text"];
        }
        else {
          obj["path"] = parent + "/" + obj["text"];
        }

        if (xml.getAttribute('name').match(/^\d{8}$/)){
          obj["icon"] = "ti-calendar";
        }
        else {
          obj["opened"] = true;
          obj["icon"] = "ti-user";
          if (xml.hasChildNodes()) {
            obj["children"] = [];
            for (var i = 0; i < xml.childNodes.length; i++) {
              var item = xml.childNodes.item(i);
              if (item.nodeName == "dir")
                obj["children"].push(this.importPipelineXmlToJson(item, obj["path"]));
            }
          }
        }

      }

      return obj;
    },
    anonymize: function(){

      //first clear the manifest
      this.$http.get('/Collection/clearManifest').then(response =>{
        console.log('manifest cleared');
      }, response => {
        alert("There was an error clearing the manifest");
      });

      //Get the selected items
      var pathsToAnonymize = [];
      //get each selected item from the tree view
      for (var i = 0; i < this.inImportPipeline.length; i++){
        var patient = this.inImportPipeline[i];
        if(patient.selected) {
          console.log('anonymize ' + patient.path);
          pathsToAnonymize.push(patient.path);
        }
        else if (patient.children){
          //check if any children are selected
          for(var j = 0; j < patient.children.length; j++){
            var studyDate = patient.children[j];
            if (studyDate.selected) {
              console.log('anonymize ' + studyDate.path);
              pathsToAnonymize.push(studyDate.path);
            }
          }
        }
      }

      console.log("pathsToAnonymize:" + pathsToAnonymize.length)
      //Pass each selected path to the anonymizer function
      for (var k = 0; k < pathsToAnonymize.length; k++)
      {
        var path = pathsToAnonymize[k];
        var relativePath = path.substring(path.indexOf("DirectoryStorageService/"));
        this.$http.get('/Collection/anonymize?file=' + relativePath).then(response =>{
          console.log('anonymizing ' + relativePath);
        }, response => {
          alert("There was an error anonymizing " + relativePath);
        });
      }


      return new Promise((resolve, reject) => {
        var myhttp = this.$http;

        var checkstatus = function(){
          setTimeout(function(){

            myhttp.get('/Collection/getManifestStatus').then(response => {
              console.log("getManifestStatus: " + response.body);
              var xml = parser.parseFromString(response.body, "text/xml");
              var status = xml.getElementsByTagName("Status")[0];
              var currentManifestInstanceCount = status.getAttribute("currentManifestInstanceCount");
              var currentQuarantineCount = status.getAttribute("currentQuarantineCount");
              var queuedInstanceCount = status.getAttribute("queuedInstanceCount");
              var startingQuarantineCount = status.getAttribute("startingQuarantineCount");
              var complete = startingQuarantineCount + queuedInstanceCount == currentQuarantineCount + currentManifestInstanceCount;
              console.log("anonymization complete: " + complete);
              if (complete)
                resolve(complete);
              else
                checkstatus();
            })
          }, 5000)
        }
        checkstatus();
      })
    },
    updateAnonymizationNumbers: function () {
      this.$http.get('Collection/listAnonymized').then(response => {
        var xml = parser.parseFromString(response.body, "text/xml");
        var dicomObjects = xml.getElementsByTagName("DicomObject");

        var patientSet = new Set();
        var seriesSet = new Set();
        var studySet = new Set();

        for (var i= 0; i< dicomObjects.length; i++) {
          patientSet.add(dicomObjects[i].getAttribute('PatientID'));
          studySet.add(dicomObjects[i].getAttribute('StudyDate'));
          seriesSet.add(dicomObjects[i].getAttribute('PatientID') + dicomObjects[i].getAttribute('Series'));
        }

        this.patientsAnonymized = Array.from(patientSet).length;
        this.studiesAnonymized = Array.from(studySet).length;
        this.seriesAnonymized = Array.from(seriesSet).length;

      }, response => {
        alert("There was a problem retrieving the anonymized list.");
      });
    },
    transferToTCIA: function () {
      var filepath = "DirectoryStorageService";
      this.$http.get('/Collection/export?file='+filepath).then(response => {
        console.log("export started " + response.body);
      }, response => {
        alert("There was a problem exporting the files.")
      });
      return true;
    },
    directoryItemClick: function (node) {
      this.currentFileSystemPath = node.model.path;
      this.currentPathIsDir = (node.model.type == "dir" ?  true: false);
    },
    directoryDoubleClick: function() {
      if (this.currentPathIsDir)
        this.updateFileSystemTree(this.currentFileSystemPath);
    },
    upDirectoryClick: function(){
      this.updateFileSystemTree(this.fileSystem[0].parent);
    },
    selectAllClick: function(event){
      if (this.selectButtontext === "Deselect All") {
        this.selectButtontext = "Select All";
        for(var i in this.inImportPipeline){
          var obj = this.inImportPipeline[i];
          obj.selected = false;
          for(var j in obj.children){
            var child = obj.children[j];
            child.selected = false;
          }
        }
      }
      else {
        this.selectButtontext = "Deselect All";
        for(var i in this.inImportPipeline){
          var obj = this.inImportPipeline[i];
          obj.selected = true;
          for(var j in obj.children){
            var child = obj.children[j];
            child.selected = true;
          }
        }
      }
    },
    updateAvailableServerSpace: function () {
      // <space partition="D:\" available="434932" units="MB"/>
      this.$http.get('/Collection/getAvailableSpace').then(response => {
        var xml = parser.parseFromString(response.body, "text/xml");
        var partition = xml.getElementsByTagName("space")[0].getAttribute("partition");
        var available = xml.getElementsByTagName("space")[0].getAttribute("available");
        var units = xml.getElementsByTagName("space")[0].getAttribute("units");

        this.serverSpace = available + " " + units + " available on partition " + partition;
      }, response=> {
        alert ("There was a problem finding the available server space.");
      });
    },
    updateNextButtonText: function(text){
      //change 'NEXT' button text
      var footerRight = document.getElementsByClassName('wizard-footer-right')[0];
      var spanTag = footerRight.getElementsByTagName('span')[0];
      var button = spanTag.getElementsByClassName('wizard-btn')[0];
      button.innerText = text;
    },
    updateBackButtonText: function(text){
      //change 'BACK' button text
      var footerLeft = document.getElementsByClassName('wizard-footer-left')[0];
      var spanTag = footerLeft.getElementsByTagName('span')[0];
      if (spanTag) {
        var button = spanTag.getElementsByClassName('wizard-btn')[0];
        button.innerText = text;
      }
    },
    downloadAnonymizedManifest: function(){
      this.$http.get('/Collection/listExportManifest/csv').then(response=>{
          var link = window.document.createElement("a");
          link.setAttribute("href", "data:text/csv;charset=UTF-8," + response.body);
          link.setAttribute("download", "anonymized_manifest.csv");
          link.click();
        },
        response=>{
          alert("There was an error getting the anonymized manifest.");
        });
    },
    downloadMappingManifest: function(){
      this.$http.get('/Collection/listLocalManifest/csv').then(response =>{
        var link = window.document.createElement("a");
        link.setAttribute("href", "data:text/csv;charset=UTF-8," + response.body);
        link.setAttribute("download", "mapping_manifest.csv");
        link.click();
      }, response =>{
        alert("There was an error getting the mapping manifest.");
      });
    }
  },
  data: function() {
    return {
      loadingWizard: false,
      serverSpace: "0",
      currentFileSystemPath: "/",
      patientsAnonymized: 0,
      studiesAnonymized: 0,
      seriesAnonymized: 0,
      currentPathIsDir: true,
      selectButtontext: 'Deselect All',
      fileSystem: [{
          "text": "Retrieving directory information",
          "opened": true,
          "icon": "ti-alert"
        }],
      inImportPipeline: [{
        "text": "Gathering data from import pipeline. Please wait a moment...",
        "opened": true,
        "icon": "ti-alert"
      }]
    }
  }

}

</script>

<style lang="scss">
#app {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #ffffff;
  margin-top: 60px;
}

h1, h2 {
  font-weight: normal;
}

ul {
  list-style-type: none;
  padding: 0;
}

li {
  display: inline-block;
  margin: 0 10px;
}

.link{
  color: #FFDC00
}

.action-btn{
  background-color: rgb(79, 198, 249);
  border-color: rgb(79, 198, 249);
  color: white;
}

.center {
  margin: auto;
  width: 50%;
}

.tree-selected{
  background: #4fc6f9 !important;
}

.anonymize-tree > .tree-children > .tree-node > .tree-selected{
  background: none !important;
}
.anonymize-tree > .tree-children > .tree-node > .tree-children > .tree-node > .tree-selected{
  background: none !important;
}

.anonymize-tree > .tree-children > .tree-node > .tree-hover{
  background: none !important;
}
.anonymize-tree > .tree-children > .tree-node > .tree-children > .tree-node > .tree-hover{
  background: none !important;
}

.loader {
  border: 16px solid #f3f3f3; /* Light grey */
  border-top: 16px solid #4fc6f9; /* Blue */
  border-radius: 50%;
  width: 120px;
  height: 120px;
  animation: spin 2s linear infinite;
  margin: auto;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

ul.anonymizedSummary{
  display: inline-block;
  text-align: left;
}

ul.anonymizedSummary li
{
  display: block;
  padding-top: 5px;
}
</style>
