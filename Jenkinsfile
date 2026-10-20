
pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                echo 'Checking out MedVerify source code'
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                bat 'npm install'
            }
        }

        stage('Build and Test') {
            steps {
                bat 'npm run build'
            }
        }

        stage('Build Docker Image') {
            steps {
                bat 'docker build -t ghcr.io/jashkhant185-png/medverify:latest .'
            }
        }

        




stage('Push Image to GitHub Container Registry') {
    steps {
        withCredentials([
            usernamePassword(
                credentialsId: 'ghcr-creds',
                usernameVariable: 'GHCR_USER',
                passwordVariable: 'GHCR_TOKEN'
            )
        ]) {
            powershell '''
                $ErrorActionPreference = "Stop"

                $env:GHCR_TOKEN |
                    docker login ghcr.io `
                        --username $env:GHCR_USER `
                        --password-stdin

                if ($LASTEXITCODE -ne 0) {
                    throw "GitHub Container Registry login failed"
                }

                docker push ghcr.io/jashkhant185-png/medverify:latest

                if ($LASTEXITCODE -ne 0) {
                    throw "Image push to GHCR failed"
                }
            '''
        }
    }
}

}

    }


